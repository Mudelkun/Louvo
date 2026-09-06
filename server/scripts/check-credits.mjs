#!/usr/bin/env node
/**
 * The credit system, end to end, without a database, a store or a webhook.
 *
 *   npm run build && node scripts/check-credits.mjs
 *
 * `check-previews.mjs` guards the two silent failures of a job queue. This one
 * guards the four silent failures of a ledger, and every one of them is a bug
 * that costs somebody money without anybody noticing:
 *
 * **A credit spent twice.** Two taps on Generate, or a retried POST, producing
 * two generations against one credit. The guard is that the balance moves by
 * compare-and-set, and it is exercised here by draining an account to zero and
 * asking for one more.
 *
 * **A credit lost.** A generation that failed and was charged for anyway. Every
 * terminal transition settles the charge in the same transaction that sets the
 * status, and `unsettledCharges()` is asserted empty after every branch —
 * exactly as `unscrubbed()` is for the photograph.
 *
 * **A free generation handed out twice.** The whole point of install anchors.
 * The reinstall is simulated here the way Android actually does it: a brand-new
 * device secret presenting the same `ANDROID_ID`.
 *
 * **A purchase granted twice.** RevenueCat retries any non-2xx, so a replayed
 * delivery is a normal event rather than an attack. Replayed by event id and
 * replayed by transaction id are two different tests because they are caught by
 * two different indexes.
 *
 * It runs the real migrations, the real SQL and the real webhook handler against
 * `pg-mem`. The transaction helper in `db.ts` is pointed at the same in-memory
 * client, because a ledger whose atomic path cannot be executed is a ledger with
 * no test.
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
process.env.DATABASE_URL ??= 'postgres://credits/local';
const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);
/**
 * `withTransaction` reaches for a *connection*, not the pool, so that the
 * settle-and-set-status pair is genuinely one transaction. Handing it the single
 * in-memory client is what lets this file execute that path rather than assert
 * about it from the outside.
 */
dbModule.pool.connect = async () => ({
  query: (text, values) => client.query(text, values),
  release: () => undefined,
});

const credits = await import('../dist/credits.js');
const anchors = await import('../dist/anchors.js');
const accounts = await import('../dist/accounts.js');
const purchases = await import('../dist/purchases.js');
const jobs = await import('../dist/jobs.js');
const { deviceIdFor, touchDevice } = await import('../dist/devices.js');

const sql = (text, values = []) => client.query(text, values).then((r) => r.rows);

/** A job, submitted and charged exactly the way `POST /v1/previews` does it. */
async function submit(deviceId, deviceAnchors, { idempotencyKey = null } = {}) {
  const id = jobs.newJobId();
  const job = await jobs.createJob({
    id,
    deviceId,
    hairstyleId: 'buzz-cut',
    gender: 'male',
    hairType: null,
    lengthId: null,
    colorId: null,
    photoWidth: 1170,
    photoHeight: 2532,
    photoKey: jobs.photoKey(id),
    idempotencyKey,
  });
  if (job.id !== id) return { job, charge: null, replayed: true };
  const charge = await credits.reserve(deviceId, deviceAnchors);
  if (!charge) {
    await jobs.markCancelled(job.id);
    return { job, charge: null, refused: true };
  }
  await credits.attachCharge(job.id, charge);
  return { job, charge };
}

const finish = async (id) =>
  jobs.markReady(id, { resultKey: jobs.resultKey(id), width: 1248, height: 1664, expiresAt: jobs.retentionDeadline() });

// ===========================================================================
// 1. The free allowance, and the reinstall it exists to survive
// ===========================================================================

const phoneSecret = 'check-credits-device-secret-aaaaaaaaaa';
const phone = deviceIdFor(phoneSecret);
await touchDevice(phone);

// An Android phone: its keystore secret, plus the ANDROID_ID that outlives it.
const ANDROID_ID = '0123456789abcdef';
const androidAnchors = [
  { kind: 'device', value: phone },
  { kind: 'android_id', value: ANDROID_ID },
];

const initial = await anchors.registerAnchors(phone, androidAnchors);
assert.equal(initial.remaining, 2, 'a new install is owed two free generations');
assert.equal(initial.ids.length, 2, 'both anchors are registered');

let state = await credits.creditState(phone);
assert.equal(state.free, 2);
assert.equal(state.credits, 0, 'a signed-out device has no purchased credits');
assert.equal(state.total, 2);
assert.equal(state.signedIn, false);

// One free generation, all the way through.
const first = await submit(phone, androidAnchors);
assert.equal(first.charge.source, 'free', 'the free allowance is spent before anything else');
assert.equal((await credits.creditState(phone)).free, 1, 'the hold is visible immediately, not on completion');

await finish(first.job.id);
assert.equal((await credits.creditState(phone)).free, 1, 'completing turns the hold into a spend, not a second charge');
assert.deepEqual(await credits.unsettledCharges(), [], 'a delivered generation settles its charge');

// The second one fails at the model. Nobody pays for that.
const second = await submit(phone, androidAnchors);
assert.equal(second.charge.source, 'free');
assert.equal((await credits.creditState(phone)).free, 0, 'both free generations are now spoken for');

await jobs.markFailed(second.job.id, 'the generator rejected the request', 'fal_400');
assert.equal((await credits.creditState(phone)).free, 1, 'a failed generation gives the free one back');
assert.deepEqual(await credits.unsettledCharges(), [], 'a failed generation settles its charge');

// Spend it again, properly this time, and the device is out.
const third = await submit(phone, androidAnchors);
await finish(third.job.id);
assert.equal((await credits.creditState(phone)).free, 0, 'two free generations, and no more');

const refused = await submit(phone, androidAnchors);
assert.ok(refused.refused, 'a third free generation is refused');
assert.equal(refused.charge, null);
assert.deepEqual(await credits.unsettledCharges(), [], 'a refused submit leaves nothing held');

// --- the reinstall ---------------------------------------------------------
// Android clears the Keystore with the package, so the secret is new and the
// device id with it. `ANDROID_ID` is not. This is the entire feature.
const reinstalledSecret = 'check-credits-device-secret-bbbbbbbbbb';
const reinstalled = deviceIdFor(reinstalledSecret);
await touchDevice(reinstalled);
const reinstalledAnchors = [
  { kind: 'device', value: reinstalled },
  { kind: 'android_id', value: ANDROID_ID },
];

assert.notEqual(reinstalled, phone, 'a reinstall really is a different device row');
const after = await anchors.registerAnchors(reinstalled, reinstalledAnchors);
assert.equal(after.remaining, 0, 'reinstalling does not restore the free allowance');
assert.ok(
  (await submit(reinstalled, reinstalledAnchors)).refused,
  'and the reinstalled app cannot generate on the free allowance either',
);

// The partial case the brief calls out by name: one used, then a reinstall.
const halfSecret = 'check-credits-device-secret-cccccccccc';
const half = deviceIdFor(halfSecret);
await touchDevice(half);
const halfAnchors = [
  { kind: 'device', value: half },
  { kind: 'android_id', value: 'fedcba9876543210' },
];
await anchors.registerAnchors(half, halfAnchors);
await finish((await submit(half, halfAnchors)).job.id);

const halfAgainSecret = 'check-credits-device-secret-dddddddddd';
const halfAgain = deviceIdFor(halfAgainSecret);
await touchDevice(halfAgain);
const halfAgainAnchors = [
  { kind: 'device', value: halfAgain },
  { kind: 'android_id', value: 'fedcba9876543210' },
];
assert.equal(
  (await anchors.registerAnchors(halfAgain, halfAgainAnchors)).remaining,
  1,
  'one used before a reinstall leaves exactly one after it, not two',
);

// An iPhone reports no ANDROID_ID at all: its Keychain secret is the anchor, and
// it survives a reinstall on its own.
const iphoneSecret = 'check-credits-device-secret-eeeeeeeeee';
const iphone = deviceIdFor(iphoneSecret);
await touchDevice(iphone);
const iphoneAnchors = anchors.anchorsFrom(iphone, undefined);
assert.equal(iphoneAnchors.length, 1, 'a device with no extra anchors still has one');
assert.equal(iphoneAnchors[0].kind, 'device');
assert.equal((await anchors.registerAnchors(iphone, iphoneAnchors)).remaining, 2, 'a genuinely new phone gets two');

// A malformed anchor is dropped rather than trusted or fatal.
assert.deepEqual(
  anchors.anchorsFrom(iphone, 'android_id:not-a-real-android-id').map((a) => a.kind),
  ['device'],
  'a malformed ANDROID_ID is ignored',
);

// ===========================================================================
// 2. The account, and the credits on it
// ===========================================================================

const identity = { provider: 'email', subject: 'someone@example.com', email: 'someone@example.com' };
const { userId, created } = await accounts.upsertAccount(identity, null);
assert.ok(created, 'the first sign-in creates the account');
assert.equal(
  (await accounts.upsertAccount(identity, null)).userId,
  userId,
  'signing in again finds the same account rather than making a second',
);

await accounts.adoptDevice(reinstalled, userId);
state = await credits.creditState(reinstalled);
assert.equal(state.signedIn, true);
assert.equal(state.credits, 0, 'signing in does not conjure credits');
assert.equal(state.free, 0, 'and it does not reset the free allowance either');

// Email codes.
const code = await accounts.issueEmailCode('someone@example.com');
assert.match(code, /^\d{6}$/, 'the code is six digits');
await assert.rejects(
  () => accounts.consumeEmailCode('someone@example.com', '000000'),
  /not right/,
  'a wrong code is refused',
);
await accounts.consumeEmailCode('someone@example.com', code);
await assert.rejects(
  () => accounts.consumeEmailCode('someone@example.com', code),
  /new code/,
  'a code cannot be used twice',
);

// ===========================================================================
// 3. Purchases
// ===========================================================================

const product = (await purchases.creditProducts()).find((p) => p.credits === 10);
assert.ok(product, 'the catalog ships a ten-generation pack');

const event = {
  id: 'evt_1',
  type: 'NON_RENEWING_PURCHASE',
  app_user_id: userId,
  product_id: product.id,
  transaction_id: 'txn_1',
  store: 'APP_STORE',
  environment: 'PRODUCTION',
  price_in_purchased_currency: 9.99,
  currency: 'USD',
};

assert.deepEqual(
  await purchases.applyWebhookEvent(event),
  { applied: 'granted', credits: 10, userId },
  'a purchase grants its credits',
);
assert.equal(await credits.balanceFor(userId), 10);

// The two replays, caught by two different indexes.
assert.equal((await purchases.applyWebhookEvent(event)).applied, 'duplicate', 'the same event id is not applied twice');
assert.equal(
  (await purchases.applyWebhookEvent({ ...event, id: 'evt_2' })).applied,
  'duplicate',
  'nor is the same transaction under a new event id',
);
assert.equal(await credits.balanceFor(userId), 10, 'and neither replay moved the balance');

// Things it should decline to act on, all without throwing.
assert.equal((await purchases.applyWebhookEvent({ ...event, id: 'e3', type: 'RENEWAL' })).applied, 'ignored');
assert.equal(
  (await purchases.applyWebhookEvent({ ...event, id: 'e4', transaction_id: 't4', product_id: 'com.luvo.unknown' }))
    .applied,
  'ignored',
  'an unknown product grants nothing',
);
assert.equal(
  (await purchases.applyWebhookEvent({ ...event, id: 'e5', transaction_id: 't5', app_user_id: 'usr_nobody' })).applied,
  'ignored',
  'an unknown account grants nothing',
);
assert.equal(await credits.balanceFor(userId), 10, 'none of which moved the balance');

// The price is recorded and nothing reads it to decide anything.
const [purchased] = await sql('select price_cents, currency, store from purchases where store_transaction_id = $1', [
  'txn_1',
]);
assert.equal(purchased.price_cents, 999, 'the amount is stored in cents, exactly');
assert.equal(purchased.store, 'app_store');

// ===========================================================================
// 4. Spending purchased credits
// ===========================================================================

state = await credits.creditState(reinstalled);
assert.equal(state.free, 0);
assert.equal(state.credits, 10);
assert.equal(state.total, 10, 'the two pots add up for the purpose of "can I generate"');

const paid = await submit(reinstalled, reinstalledAnchors);
assert.equal(paid.charge.source, 'paid', 'with no free left, a generation comes out of the balance');
assert.equal(await credits.balanceFor(userId), 9, 'the credit leaves the balance at submit, not on completion');

await finish(paid.job.id);
assert.equal(await credits.balanceFor(userId), 9, 'completing does not charge a second time');

// Cancelled: the credit comes back.
const cancelled = await submit(reinstalled, reinstalledAnchors);
assert.equal(await credits.balanceFor(userId), 8);
await jobs.markCancelled(cancelled.job.id);
assert.equal(await credits.balanceFor(userId), 9, 'cancelling refunds the credit');

// Settling is idempotent, which is what makes a retried transition safe.
await jobs.markCancelled(cancelled.job.id);
assert.equal(await credits.balanceFor(userId), 9, 'settling the same job twice refunds once');

// The retried POST that must not become a second charge.
const once = await submit(reinstalled, reinstalledAnchors, { idempotencyKey: 'idem-credits' });
const balanceAfterOnce = await credits.balanceFor(userId);
const twice = await submit(reinstalled, reinstalledAnchors, { idempotencyKey: 'idem-credits' });
assert.ok(twice.replayed, 'the replayed submit returns the original job');
assert.equal(twice.job.id, once.job.id);
assert.equal(await credits.balanceFor(userId), balanceAfterOnce, 'and it does not charge a second time');
await finish(once.job.id);

// --- drained to zero, and one more asked for -------------------------------
let guard = 0;
while ((await credits.balanceFor(userId)) > 0) {
  assert.ok(guard++ < 50, 'draining the balance should take fewer than fifty generations');
  const job = await submit(reinstalled, reinstalledAnchors);
  assert.ok(job.charge, 'a generation with credits remaining must not be refused');
  await finish(job.job.id);
}

assert.equal(await credits.balanceFor(userId), 0);
const overdrawn = await submit(reinstalled, reinstalledAnchors);
assert.ok(overdrawn.refused, 'a generation with no credits is refused');
assert.equal(await credits.balanceFor(userId), 0, 'and the balance never goes negative');

// The invariant the whole ledger rests on.
assert.deepEqual(
  await credits.unsettledCharges(),
  [],
  'no settled job may still hold a credit — see the settle note in src/credits.ts',
);

const [held] = await sql('select held from credit_balances where user_id = $1', [userId]);
assert.equal(held.held, 0, 'nothing is left held once every job has settled');
const stuck = await sql('select anchor_id from free_allowance where held <> 0');
assert.deepEqual(stuck, [], 'and no anchor is left holding a free generation either');

// ===========================================================================
// 5. Refunds, and account deletion
// ===========================================================================

await purchases.applyWebhookEvent({ ...event, id: 'evt_buy2', transaction_id: 'txn_2' });
assert.equal(await credits.balanceFor(userId), 10, 'a second pack grants again');

assert.equal(
  (await purchases.applyWebhookEvent({ ...event, id: 'evt_refund', type: 'CANCELLATION', transaction_id: 'txn_2' }))
    .applied,
  'revoked',
  'a refund takes the credits back',
);
assert.equal(await credits.balanceFor(userId), 0);

// Refunding a pack whose credits are already spent must not go negative — the
// user has had the value, and a hidden debt is worse than an absorbed loss.
await purchases.applyWebhookEvent({ ...event, id: 'evt_buy3', transaction_id: 'txn_3' });
const spender = await submit(reinstalled, reinstalledAnchors);
await finish(spender.job.id);
await purchases.applyWebhookEvent({ ...event, id: 'evt_refund3', type: 'REFUND', transaction_id: 'txn_3' });
assert.equal(await credits.balanceFor(userId), 0, 'a refund clamps at zero rather than going into debt');
const [ledgerRow] = await sql(
  "select delta from credit_ledger where user_id = $1 and kind = 'revoke' order by id desc limit 1",
  [userId],
);
assert.equal(ledgerRow.delta, -10, 'though the ledger records the full revocation, so the shortfall is visible');

// --- deletion --------------------------------------------------------------
await purchases.applyWebhookEvent({ ...event, id: 'evt_buy4', transaction_id: 'txn_4' });
assert.equal(await credits.balanceFor(userId), 10);

await accounts.deleteAccount(userId);
assert.equal(await accounts.getAccount(userId), null, 'the account is gone');
assert.equal(await credits.userForDevice(reinstalled), null, 'and the device is no longer signed into it');

const survivingPurchases = await sql('select user_id from purchases where store_transaction_id = $1', ['txn_4']);
assert.equal(survivingPurchases.length, 1, 'the purchase record outlives the account');
assert.equal(survivingPurchases[0].user_id, null, 'with nobody attached to it');

// Deleting an account is not a way to be given the free two back.
assert.equal(
  (await credits.creditState(reinstalled)).free,
  0,
  'the free allowance belongs to the device and is untouched by deleting an account',
);

console.log('Credit system clean.');
console.log('  free: two per device, held at submit, refunded on failure, surviving a reinstall.');
console.log('  paid: compare-and-set, never negative, refunded on cancel, idempotent on replay.');
console.log('  purchases: granted only by webhook, deduplicated by event id and by transaction id.');
console.log('  settle: every terminal transition settles its charge, in the same transaction.');
await client.end();
