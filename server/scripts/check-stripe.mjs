#!/usr/bin/env node
/**
 * Buying credits with Stripe, without Stripe.
 *
 *   npm run build && node scripts/check-stripe.mjs
 *
 * `check-credits.mjs` guards the four silent failures of a ledger. This one
 * guards the four of a payment integration, and every one of them is either free
 * credits or somebody's money going missing:
 *
 * **A forged delivery granting credits.** `POST /v1/webhooks/stripe` is a public
 * endpoint that adds to a balance, so it is exactly as trustworthy as one HMAC
 * check. Tampered payload, wrong secret, stale timestamp and a malformed header
 * are four separate assertions because they are four separate ways in.
 *
 * **A purchase granted twice.** Two of them, and they are caught by two
 * different indexes: the same delivery retried (`event_id`), and the same
 * payment arriving under two event ids (`store, store_transaction_id`) — which
 * is not exotic, it is what the webhook racing the post-redirect confirmation
 * looks like every single time.
 *
 * **A purchase granted for the wrong amount.** The credit count is looked up in
 * `credit_products` rather than read from the session metadata, so a session
 * created against a stale price grants what the pack is worth now. Asserted by
 * lying in the metadata and checking the balance disagrees with the lie.
 *
 * **A refund that does not come back out.** Including the second one, which must
 * be a no-op rather than a second revocation.
 *
 * It runs the real migrations, the real signature check and the real grant path
 * against `pg-mem`. Nothing here reaches api.stripe.com — the session objects
 * are the shapes Stripe sends, parsed by the server's own `readSessionObject`.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let newDb;
try {
  ({ newDb } = await import('pg-mem'));
} catch {
  console.log('pg-mem is not installed — skipping.');
  process.exit(0);
}

const db = newDb({ autoCreateForeignKeyIndices: true });
db.public.registerFunction({
  name: 'now',
  returns: db.public.getType?.('timestamptz') ?? undefined,
  implementation: () => new Date(),
  impure: true,
});

const { Client } = db.adapters.createPg();
const client = new Client();
await client.connect();

for (const file of (await readdir(path.join(SERVER_ROOT, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()) {
  await client.query(await readFile(path.join(SERVER_ROOT, 'migrations', file), 'utf8'));
}

// --- the compiled server, pointed at the in-memory database ----------------
process.env.DATABASE_URL ??= 'postgres://stripe/local';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_check';
const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);
dbModule.pool.connect = async () => ({
  query: (text, values) => client.query(text, values),
  release: () => undefined,
});

const credits = await import('../dist/credits.js');
const accounts = await import('../dist/accounts.js');
const purchases = await import('../dist/purchases.js');
const stripe = await import('../dist/stripe.js');

const sql = (text, values = []) => client.query(text, values).then((r) => r.rows);
const SECRET = 'whsec_check';

let checked = 0;
const ok = (message) => {
  checked += 1;
  console.log(`  ok  ${message}`);
};

// ---------------------------------------------------------------------------
// The form encoder
// ---------------------------------------------------------------------------

/**
 * The one piece of this that is pure string handling, and the one that fails
 * invisibly: a mis-encoded `line_items[0][price]` is a Stripe 400 at the moment
 * somebody presses Buy, and never before.
 */
{
  const encoded = stripe.formEncode({
    mode: 'payment',
    line_items: [{ price: 'price_1', quantity: 1 }],
    metadata: { userId: 'usr_a', productId: 'com.luvoai.luvo.credits.10' },
    customer_email: null,
  });
  const fields = new Set(encoded.split('&'));
  assert.ok(fields.has('line_items%5B0%5D%5Bprice%5D=price_1'), 'array of objects is indexed and bracketed');
  assert.ok(fields.has('metadata%5BuserId%5D=usr_a'), 'nested objects are bracketed');
  assert.ok(!encoded.includes('customer_email'), 'null is dropped rather than sent as "null"');
  ok('the form encoder produces Stripe\'s bracket notation');
}

// ---------------------------------------------------------------------------
// The signature
// ---------------------------------------------------------------------------

const event = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) =>
  JSON.stringify({ id, type, data: { object } });

const deliver = (payload, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000), header = null } = {}) =>
  stripe.verifyWebhookSignature(
    Buffer.from(payload, 'utf8'),
    header ?? stripe.signWebhookPayload(payload, secret, timestamp),
    SECRET,
  );

{
  const payload = event('checkout.session.completed', { id: 'cs_a' });
  const verified = deliver(payload);
  assert.equal(verified.type, 'checkout.session.completed');
  ok('a correctly signed delivery verifies');

  assert.throws(
    () => stripe.verifyWebhookSignature(Buffer.from(payload.replace('cs_a', 'cs_b')), stripe.signWebhookPayload(payload, SECRET), SECRET),
    /signature_invalid|does not match/,
  );
  ok('a tampered payload is refused');

  assert.throws(() => deliver(payload, { secret: 'whsec_someone_else' }), /does not match/);
  ok('a delivery signed with another secret is refused');

  assert.throws(() => deliver(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 }), /tolerance/);
  ok('a delivery from an hour ago is refused — a captured one cannot be replayed');

  assert.throws(() => deliver(payload, { header: 'nonsense' }), /expected form/);
  ok('a malformed Stripe-Signature is refused');

  assert.throws(() => stripe.verifyWebhookSignature(Buffer.from(payload), undefined, SECRET), /no Stripe-Signature/);
  ok('a delivery with no signature at all is refused');

  /**
   * Two `v1` signatures, which is what a secret rotation actually looks like.
   * Accepting only the first would turn a routine rotation into an outage.
   */
  const rotating = `${stripe.signWebhookPayload(payload, 'whsec_old')},${stripe
    .signWebhookPayload(payload, SECRET)
    .split(',')[1]}`;
  assert.equal(stripe.verifyWebhookSignature(Buffer.from(payload), rotating, SECRET).type, 'checkout.session.completed');
  ok('a delivery carrying two signatures verifies against either');
}

// ---------------------------------------------------------------------------
// A buyer
// ---------------------------------------------------------------------------

const { userId } = await accounts.upsertAccount(
  { provider: 'email', subject: 'buyer@example.com', email: 'buyer@example.com' },
  null,
);

const session = (over = {}) => ({
  id: 'cs_test_1',
  object: 'checkout.session',
  payment_status: 'paid',
  status: 'complete',
  payment_intent: 'pi_test_1',
  client_reference_id: userId,
  amount_total: 999,
  currency: 'usd',
  metadata: { userId, productId: 'com.luvoai.luvo.credits.10', credits: '10' },
  ...over,
});

const apply = (raw, id) =>
  purchases.applyStripeEvent(
    { id: id ?? `evt_${Math.random().toString(36).slice(2)}`, type: 'checkout.session.completed', data: { object: raw } },
    stripe.readSessionObject,
  );

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

{
  const outcome = await apply(session(), 'evt_first');
  assert.equal(outcome.applied, 'granted');
  assert.equal(outcome.credits, 10);
  assert.equal(await credits.balanceFor(userId), 10);
  ok('a paid session grants the pack');

  const [row] = await sql('select store, store_transaction_id, price_cents, currency, environment from purchases');
  assert.equal(row.store, 'stripe');
  assert.equal(row.store_transaction_id, 'pi_test_1', 'the PaymentIntent is the transaction id a refund will name');
  assert.equal(Number(row.price_cents), 999, 'the amount is recorded for reconciliation and decides nothing');
  assert.equal(row.environment, 'webhook');
  ok('the purchase row records the payment intent and the amount');
}

// --- the two replays -------------------------------------------------------

{
  const again = await apply(session(), 'evt_first');
  assert.equal(again.applied, 'duplicate');
  assert.equal(await credits.balanceFor(userId), 10);
  ok('the same delivery retried grants nothing (event_id)');

  const underAnotherEvent = await apply(session(), 'evt_second');
  assert.equal(underAnotherEvent.applied, 'duplicate');
  assert.equal(await credits.balanceFor(userId), 10);
  ok('the same payment under a second event id grants nothing (store_transaction_id)');
}

/**
 * The webhook and the post-redirect confirmation, racing.
 *
 * This is the one that happens on every single purchase, and the one the
 * confirmation route would be unsafe without.
 */
{
  const paid = stripe.readSessionObject(session({ id: 'cs_race', payment_intent: 'pi_race' }));
  const first = await purchases.grantStripeSession(paid, { origin: 'confirm' });
  const second = await purchases.grantStripeSession(paid, { origin: 'webhook', eventId: 'evt_race' });
  assert.equal(first.applied, 'granted');
  assert.equal(second.applied, 'duplicate');
  assert.equal(await credits.balanceFor(userId), 20);
  ok('confirmation and webhook race to one grant, not two');

  const twice = await purchases.grantStripeSession(paid, { origin: 'confirm' });
  assert.equal(twice.applied, 'duplicate');
  ok('confirming twice grants nothing');
}

// --- what is not granted ---------------------------------------------------

{
  assert.equal((await apply(session({ id: 'cs_unpaid', payment_intent: 'pi_unpaid', payment_status: 'unpaid' }))).applied, 'ignored');
  ok('an unpaid session grants nothing');

  assert.equal(
    (await apply(session({ id: 'cs_nouser', payment_intent: 'pi_nouser', client_reference_id: 'usr_missing', metadata: { productId: 'com.luvoai.luvo.credits.10' } }))).applied,
    'ignored',
  );
  ok('a session naming an account that no longer exists grants nothing');

  assert.equal(
    (await apply(session({ id: 'cs_noprod', payment_intent: 'pi_noprod', metadata: { userId, productId: 'com.luvoai.luvo.credits.9999' } }))).applied,
    'ignored',
  );
  ok('a session naming a pack we do not sell grants nothing');

  const before = await credits.balanceFor(userId);
  await apply({ id: 'cs_x', payment_status: 'paid', payment_intent: 'pi_x', client_reference_id: userId, metadata: {} });
  assert.equal(await credits.balanceFor(userId), before);
  ok('a session with no product in its metadata grants nothing');
}

/**
 * The metadata is a label, not an instruction.
 *
 * A session that claims a thousand credits still grants what the pack is worth
 * in `credit_products`. This is the assertion that keeps the payload from being
 * an input to the ledger.
 */
{
  const before = await credits.balanceFor(userId);
  const outcome = await apply(
    session({ id: 'cs_liar', payment_intent: 'pi_liar', metadata: { userId, productId: 'com.luvoai.luvo.credits.5', credits: '1000' } }),
  );
  assert.equal(outcome.applied, 'granted');
  assert.equal(await credits.balanceFor(userId), before + 5, 'the database decides, not the payload');
  ok('the credit count comes from credit_products and never from the session');
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

{
  const before = await credits.balanceFor(userId);
  const refunded = await purchases.applyStripeEvent(
    { id: 'evt_refund', type: 'charge.refunded', data: { object: { object: 'charge', payment_intent: 'pi_test_1' } } },
    stripe.readSessionObject,
  );
  assert.equal(refunded.applied, 'revoked');
  assert.equal(refunded.credits, 10);
  assert.equal(await credits.balanceFor(userId), before - 10);
  ok('a refund takes the pack back out');

  const again = await purchases.applyStripeEvent(
    { id: 'evt_refund_2', type: 'charge.refunded', data: { object: { object: 'charge', payment_intent: 'pi_test_1' } } },
    stripe.readSessionObject,
  );
  assert.equal(again.applied, 'duplicate');
  assert.equal(await credits.balanceFor(userId), before - 10);
  ok('refunding the same payment twice takes nothing further');

  const [row] = await sql('select status from purchases where store_transaction_id = $1', ['pi_test_1']);
  assert.equal(row.status, 'revoked');
  ok('the purchase row is marked revoked and survives for reconciliation');
}

/**
 * A refund of more credits than are left, which is the case `revoke()` clamps.
 *
 * Somebody who buys ten, spends ten and charges back must land on zero rather
 * than on minus ten — a negative balance means the next pack they buy silently
 * buys them nothing, which reads as theft.
 */
{
  await sql('update credit_balances set balance = 2 where user_id = $1', [userId]);
  await purchases.applyStripeEvent(
    { id: 'evt_refund_3', type: 'charge.refunded', data: { object: { object: 'charge', payment_intent: 'pi_race' } } },
    stripe.readSessionObject,
  );
  assert.equal(await credits.balanceFor(userId), 0, 'clamped at zero, never negative');
  ok('a refund larger than the balance clamps at zero');
}

// ---------------------------------------------------------------------------
// The packs, with and without a till
// ---------------------------------------------------------------------------

{
  // No STRIPE_SECRET_KEY was set for this run, so this is the "checkout is not
  // open on this deployment" path — the one a fresh checkout and the store
  // builds both take.
  const products = await purchases.creditProducts();
  assert.ok(products.length >= 3);
  assert.ok(products.every((product) => product.price === null && product.purchasable === false));
  ok('with no Stripe key every pack is listed, priced at null, and not purchasable');

  await sql('update credit_products set stripe_price_id = null where id = $1', ['com.luvoai.luvo.credits.5']);
  assert.equal(await purchases.stripePriceIdFor('com.luvoai.luvo.credits.5'), null);
  ok('a pack with no Price id is refused at the checkout door');
}

// ---------------------------------------------------------------------------
// The payment history
// ---------------------------------------------------------------------------

/**
 * The account page's Payments section, which has one failure worth guarding:
 * **a total that disagrees with the rows under it.**
 *
 * A refunded purchase stays in the list — a statement that hides a reversal is a
 * statement nobody can reconcile — and must not be counted, because that money
 * came back. Getting either half wrong produces a page that looks perfectly
 * fine and overstates what somebody has paid us.
 */
{
  // Something granted, so the totals have anything in them at all: everything
  // above this point has been refunded by the two revoke blocks.
  await purchases.grantStripeSession(
    stripe.readSessionObject(
      session({
        id: 'cs_hist',
        payment_intent: 'pi_hist',
        amount_total: 499,
        metadata: { userId, productId: 'com.luvoai.luvo.credits.5', credits: '5' },
      }),
    ),
    { origin: 'webhook', eventId: 'evt_hist' },
  );

  const history = await purchases.purchaseHistory(userId);
  const rows = await sql('select id, status, price_cents, credits from purchases where user_id = $1', [userId]);
  assert.equal(history.purchases.length, rows.length, 'every purchase on the account is listed');

  const at = history.purchases.map((purchase) => purchase.at);
  assert.deepEqual(at, [...at].sort((a, b) => b - a), 'newest first');
  ok('the history lists every purchase on the account, newest first');

  const granted = rows.filter((row) => row.status === 'granted');
  assert.ok(granted.length && granted.length < rows.length, 'the fixture has both kinds in it');
  assert.deepEqual(history.spent, [
    { currency: 'USD', amount: granted.reduce((sum, row) => sum + Number(row.price_cents ?? 0), 0) },
  ]);
  assert.equal(history.credits, granted.reduce((sum, row) => sum + Number(row.credits), 0));
  assert.equal(history.unpriced, 0);
  ok('the total is the sum of what was kept, per currency');

  const refunded = history.purchases.filter((purchase) => purchase.status === 'revoked');
  assert.ok(refunded.length, 'a refund is still part of the history');
  assert.ok(
    refunded.every((purchase) => purchase.amount !== null),
    'and keeps its amount, so the rows still add up to the total',
  );
  ok('a refunded payment is listed, priced, and left out of the total');

  assert.ok(history.purchases.every((purchase) => purchase.documented), 'every stripe row can be documented');
  ok('a stripe purchase is marked as one an invoice can be asked for');

  const mine = history.purchases[0];
  assert.ok(await purchases.purchaseFor(userId, mine.id));
  assert.equal(
    await purchases.purchaseFor('usr_somebody_else', mine.id),
    null,
    'a purchase id is not a bearer token for the invoice behind it',
  );
  ok('an invoice can only be fetched by the account that paid for it');
}

/**
 * Two currencies are two totals, never one.
 *
 * Summing them would need a rate, and a rate is a second price this service has
 * spent two migrations refusing to hold.
 */
{
  await sql(
    'insert into purchases (id, user_id, store, product_id, credits, price_cents, currency, store_transaction_id, status) ' +
      "values ($1, $2, 'stripe', 'com.luvoai.luvo.credits.5', 5, 450, 'EUR', 'pi_eur', 'granted')",
    ['pur_eur_check', userId],
  );
  const history = await purchases.purchaseHistory(userId);
  assert.equal(history.spent.length, 2, 'one entry per currency');
  assert.ok(history.spent.some((total) => total.currency === 'EUR' && total.amount === 450));
  await sql('delete from purchases where id = $1', ['pur_eur_check']);
  ok('two currencies are reported as two totals rather than added together');
}

console.log(`\n  ${checked} checks passed — the webhook cannot be forged and a purchase cannot be applied twice.\n`);
