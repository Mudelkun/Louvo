/**
 * Purchases: the RevenueCat webhook, and the products it grants.
 *
 * ## The client never grants a credit
 *
 * The app calls RevenueCat, RevenueCat validates the receipt with Apple or
 * Google, and RevenueCat posts *here*. Nothing the phone says adds to a balance.
 * That ordering is the whole security model, and it is not paranoia about our
 * own users: a receipt is validated by the party that issued it, and an app that
 * credits itself on `purchase()` resolving is an app whose credits are free to
 * anyone willing to run a proxy.
 *
 * The consequence is a race the app has to be written around rather than
 * against: `purchase()` can resolve on the phone a second or two before the
 * webhook lands here. `POST /v1/credits/sync` exists for that second — the app
 * asks for its balance again, and the paywall waits rather than lying.
 *
 * ## Idempotency, twice over
 *
 * RevenueCat retries any non-2xx, so a replay is a normal Tuesday rather than an
 * attack. Two unique indexes catch it: `event_id`, which stops the same delivery
 * being applied twice, and `(store, store_transaction_id)`, which stops the same
 * *purchase* being applied twice even if it arrives under two event ids. The
 * second is the one that matters — RevenueCat re-sends historical events after
 * some configuration changes, and a transaction id is the store's own identity
 * for the money that moved.
 *
 * ## Why the credit count is ours and the price is not
 *
 * `credit_products` maps a store product id to a number of generations. The
 * price is never read from here and is never sent to the app: StoreKit and Play
 * Billing quote it, localised and in the user's own currency, and any second
 * copy of it is a number that will eventually disagree with the till. What
 * arrives on the webhook *is* recorded — `price_cents` and `currency` — because
 * reconciliation needs it, and nothing decides anything from it.
 */

import { grant, newPurchaseId, revoke } from './credits.js';
import { env } from './env.js';
import { query, type Queryer } from './db.js';
import { fetchPrice, stripeConfigured, type StripeSession } from './stripe.js';

export interface CreditProduct {
  id: string;
  credits: number;
  badge: string | null;
  /**
   * What the till says, or null.
   *
   * Read from the Stripe Price named by `credit_products.stripe_price_id` and
   * **never stored** — see `007_stripe.sql`. Null means one of three honest
   * things, all of which the site renders as "no price yet": this deployment has
   * no Stripe key, this pack has no Price pointed at it, or Stripe could not be
   * reached for the label while the rest of the response was perfectly fine.
   *
   * On a phone it is always null, and that is not a gap: StoreKit and Play quote
   * their own prices, localised, and this field is the web's equivalent of that
   * rather than a second copy of it.
   */
  price: { amount: number; currency: string } | null;
  /** Whether this pack can actually be bought here and now. */
  purchasable: boolean;
}

interface ProductRow {
  id: string;
  credits: number;
  badge: string | null;
  stripe_price_id: string | null;
}

/**
 * What the paywall shows, joined against the till's own prices.
 *
 * The join is over the network rather than over a column, and that is the point
 * of the whole arrangement: a price lives in exactly one place, which is the
 * thing that will charge somebody. `fetchPrice` caches for a minute and swallows
 * its own failures, so a pack list is never held up or failed by a label.
 */
export async function creditProducts(db: Queryer = query): Promise<CreditProduct[]> {
  const rows = await db<ProductRow>(
    'select id, credits, badge, stripe_price_id from credit_products where published = true order by sort_order',
  );
  if (!stripeConfigured()) {
    return rows.map((row) => ({ id: row.id, credits: row.credits, badge: row.badge, price: null, purchasable: false }));
  }
  return Promise.all(
    rows.map(async (row) => {
      const price = row.stripe_price_id ? await fetchPrice(row.stripe_price_id) : null;
      return {
        id: row.id,
        credits: row.credits,
        badge: row.badge,
        price: price ? { amount: price.amount, currency: price.currency } : null,
        // A pack with a Price id but an unreadable Price is still buyable —
        // Stripe reads it at checkout whether or not we could read it for a
        // label. Refusing the sale over a missing caption would be the interface
        // deciding on the till's behalf.
        purchasable: !!row.stripe_price_id,
      };
    }),
  );
}

/** The Price a pack is sold at, for the checkout route. Null if it has none. */
export async function stripePriceIdFor(productId: string, db: Queryer = query): Promise<string | null> {
  const rows = await db<{ stripe_price_id: string | null }>(
    'select stripe_price_id from credit_products where id = $1 and published = true',
    [productId],
  );
  return rows[0]?.stripe_price_id ?? null;
}

export async function creditsForProduct(productId: string, db: Queryer = query): Promise<number | null> {
  const rows = await db<{ credits: number }>(
    'select credits from credit_products where id = $1 and published = true',
    [productId],
  );
  return rows[0]?.credits ?? null;
}

// ---------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------

/**
 * The event types worth acting on, and what they mean for a consumable.
 *
 * RevenueCat sends a dozen types and most of them are about subscriptions, which
 * this app does not sell. A credit pack is a consumable, so it arrives as
 * `NON_RENEWING_PURCHASE`. `INITIAL_PURCHASE` is accepted too because a
 * misconfigured product in the RevenueCat dashboard is reported as one, and
 * silently ignoring a purchase somebody paid for is the worst available failure.
 *
 * `CANCELLATION` and `REFUND` are the money going back. For a consumable this is
 * a refund granted by Apple or Google after the fact — not a subscription being
 * turned off — so credits come back out. `EXPIRATION` is subscription-only and
 * is deliberately not handled: acting on it would revoke credits from a product
 * that cannot expire.
 */
const GRANTING = new Set(['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE']);
const REVOKING = new Set(['CANCELLATION', 'REFUND']);

export type WebhookOutcome =
  | { applied: 'granted'; credits: number; userId: string }
  | { applied: 'revoked'; credits: number; userId: string }
  | { applied: 'duplicate' }
  | { applied: 'ignored'; reason: string };

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  store?: string;
  environment?: string;
  price_in_purchased_currency?: number;
  currency?: string;
}

const STORES: Record<string, string> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  AMAZON: 'amazon',
  STRIPE: 'stripe',
  PROMOTIONAL: 'promo',
};

/**
 * Applies one RevenueCat event.
 *
 * Every "ignored" branch returns rather than throws, and the route answers 200
 * to all of them. That is deliberate: RevenueCat retries a non-2xx for hours,
 * and an event we have decided not to act on is *handled*, not failed. Returning
 * 500 for "this is a subscription renewal and we sell consumables" would build a
 * permanent retry queue out of events that will never be wanted.
 */
export async function applyWebhookEvent(event: RevenueCatEvent, db: Queryer = query): Promise<WebhookOutcome> {
  const type = event.type ?? '';
  if (!GRANTING.has(type) && !REVOKING.has(type)) return { applied: 'ignored', reason: `type ${type || 'missing'}` };

  // `app_user_id` is our own user id: the app identifies itself to RevenueCat as
  // the account, which is why an account is required before buying anything.
  // `original_app_user_id` is the fallback for an event raised against a
  // RevenueCat alias rather than the id we set.
  const userId = event.app_user_id ?? event.original_app_user_id;
  if (!userId) return { applied: 'ignored', reason: 'no app_user_id' };

  const known = await db<{ id: string }>('select id from users where id = $1', [userId]);
  // An anonymous RevenueCat id — somebody who bought before signing in, which
  // the app does not permit but a sandbox tester can produce. Nothing to credit.
  if (!known[0]) return { applied: 'ignored', reason: 'unknown user' };

  /**
   * Sandbox purchases, and whether they are worth anything.
   *
   * Apple's and Google's test purchases are free, and RevenueCat reports them
   * with `environment: SANDBOX`. Granting credits for them is exactly what you
   * want while testing and exactly what you do not want in production, where a
   * TestFlight build pointed at the live RevenueCat project can mint credits at
   * no cost.
   *
   * Default is to grant, so a sandbox works out of the box; set
   * `REVENUECAT_IGNORE_SANDBOX=true` on the production deployment. Ignored is
   * still a 200 — see the note on the return type.
   */
  if (env.auth.ignoreSandboxPurchases && (event.environment ?? '').toUpperCase() === 'SANDBOX') {
    return { applied: 'ignored', reason: 'sandbox purchase' };
  }

  const productId = event.product_id ?? '';
  const credits = await creditsForProduct(productId, db);
  if (!credits) return { applied: 'ignored', reason: `unknown product ${productId}` };

  const store = STORES[event.store ?? ''] ?? 'unknown';
  const transactionId = event.transaction_id ?? event.original_transaction_id ?? event.id ?? null;
  if (!transactionId) return { applied: 'ignored', reason: 'no transaction id' };

  if (REVOKING.has(type)) {
    const rows = await db<{ id: string; credits: number; user_id: string | null }>(
      `update purchases set status = 'revoked'
        where store = $1 and store_transaction_id = $2 and status = 'granted'
        returning id, credits, user_id`,
      [store, transactionId],
    );
    const purchase = rows[0];
    // Nothing granted under that transaction, or already revoked. Both are a
    // no-op and both are correct answers to a retried delivery.
    if (!purchase?.user_id) return { applied: 'duplicate' };
    await revoke(purchase.user_id, purchase.credits, `refunded (${type})`, db);
    return { applied: 'revoked', credits: purchase.credits, userId: purchase.user_id };
  }

  const purchaseId = newPurchaseId();
  const inserted = await db<{ id: string }>(
    `insert into purchases
       (id, user_id, store, product_id, credits, price_cents, currency, store_transaction_id, event_id, environment)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict do nothing
     returning id`,
    [
      purchaseId,
      userId,
      store,
      productId,
      credits,
      // RevenueCat reports a decimal amount; cents is what a ledger wants and
      // rounding here is exact for every currency that has two decimal places.
      typeof event.price_in_purchased_currency === 'number'
        ? Math.round(event.price_in_purchased_currency * 100)
        : null,
      event.currency ?? null,
      transactionId,
      event.id ?? null,
      event.environment ?? null,
    ],
  );

  // Either unique index caught it. The credits were granted the first time and
  // granting again is the bug this exists to prevent.
  if (!inserted[0]) return { applied: 'duplicate' };

  await grant({ userId, credits, purchaseId, reason: `${productId} via ${store}` }, db);
  return { applied: 'granted', credits, userId };
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

/**
 * The two Stripe events that move a balance, and why the list is this short.
 *
 * `checkout.session.completed` is the sale. `checkout.session.async_payment_succeeded`
 * is the same sale arriving late — a delayed payment method (a bank debit,
 * Klarna) completes the session as `unpaid` and settles minutes or days later,
 * so a deployment that offers one and handles only the first would take money
 * and grant nothing. Handling both costs one line and the alternative is a
 * support ticket per delayed payment.
 *
 * `charge.refunded` is the money going back, in full or in part. Everything else
 * Stripe sends — and it sends a great many things — is ignored with a 200, for
 * the reason the RevenueCat handler ignores subscription events: an event we
 * have decided not to act on is handled, not failed, and answering non-2xx to it
 * builds a permanent retry queue out of deliveries that will never be wanted.
 */
const STRIPE_GRANTING = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const STRIPE_REVOKING = new Set(['charge.refunded']);

/** Where a Stripe grant came from, so a replay can be told from a first arrival. */
export type StripeGrantOrigin = 'webhook' | 'confirm';

/**
 * Grants the credits for one paid Checkout Session.
 *
 * Shared by the webhook and by the post-redirect confirmation, and **that
 * sharing is the design** rather than an economy. Both are the same fact — this
 * session was paid — learned by two routes with different latencies, and two
 * implementations of it would be two chances to disagree about how many credits
 * a pack is worth.
 *
 * Three things it does not trust:
 *
 * - **The credit count in the metadata.** It is written there for the dashboard
 *   and for reconciliation; the number granted is looked up in `credit_products`,
 *   which is the row this service owns. A session created against an old price
 *   still grants what the pack is worth today.
 * - **Who is asking.** The account credited is `client_reference_id`, which this
 *   server set when it created the session and Stripe handed back unchanged. The
 *   caller of the confirmation route is checked against it separately — see
 *   `checkout.ts` — so a session id leaked into a URL bar cannot be redeemed by
 *   somebody else.
 * - **That this is the first time.** `insert ... on conflict do nothing` on a
 *   row whose transaction id is the PaymentIntent means the webhook and the
 *   confirmation race harmlessly: one inserts, the other is a duplicate.
 */
export async function grantStripeSession(
  session: StripeSession,
  { origin, eventId }: { origin: StripeGrantOrigin; eventId?: string | null },
  db: Queryer = query,
): Promise<WebhookOutcome> {
  if (session.paymentStatus !== 'paid') return { applied: 'ignored', reason: `payment_status ${session.paymentStatus}` };

  const userId = session.clientReferenceId ?? session.metadata.userId ?? null;
  if (!userId) return { applied: 'ignored', reason: 'no client_reference_id' };

  const known = await db<{ id: string }>('select id from users where id = $1', [userId]);
  // The account was deleted between paying and the webhook landing, which is
  // rare and is not a failure: there is nothing to credit, the purchase is not
  // ours to invent, and Stripe should not be asked to retry forever over it.
  if (!known[0]) return { applied: 'ignored', reason: 'unknown user' };

  const productId = session.metadata.productId ?? '';
  const credits = await creditsForProduct(productId, db);
  if (!credits) return { applied: 'ignored', reason: `unknown product ${productId}` };

  /**
   * Stripe's identity for the money, and the fallback.
   *
   * The PaymentIntent is the right key: a refund names it, and both grant paths
   * see it. A session with none is a zero-amount or fully-discounted purchase,
   * where the session id is the only identity there is — still unique, still
   * idempotent, and correct for a case that cannot be refunded anyway.
   */
  const transactionId = session.paymentIntentId ?? session.id;

  const purchaseId = newPurchaseId();
  const inserted = await db<{ id: string }>(
    `insert into purchases
       (id, user_id, store, product_id, credits, price_cents, currency, store_transaction_id, event_id, environment)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict do nothing
     returning id`,
    [
      purchaseId,
      userId,
      'stripe',
      productId,
      credits,
      // Already in minor units on a Stripe session, so unlike RevenueCat's
      // decimal amount there is nothing to round and nothing to get wrong for a
      // zero-decimal currency.
      session.amountTotal,
      session.currency,
      transactionId,
      /**
       * A deterministic id for the confirmation path rather than a null.
       *
       * `purchases_event_idx` is unique, and Postgres allows any number of nulls
       * in a unique index — so leaving this null would leave the confirmation
       * relying on the transaction index alone. Deriving it from the session
       * means a double-confirmation is caught by both.
       */
      eventId ?? `confirm_${session.id}`,
      origin,
    ],
  );

  // Either index caught it: the webhook and the confirmation both arrived, or a
  // delivery was retried. The credits were granted the first time, and granting
  // again is the entire bug this exists to prevent.
  if (!inserted[0]) return { applied: 'duplicate' };

  await grant({ userId, credits, purchaseId, reason: `${productId} via stripe` }, db);
  return { applied: 'granted', credits, userId };
}

/**
 * Applies one verified Stripe event.
 *
 * Verification happened before this was called — `verifyWebhookSignature` in
 * `stripe.ts` — so the payload may be read as having come from Stripe. What it
 * may *not* be read as is authoritative about our own catalogue, which is why
 * the grant looks the credit count up rather than taking it from the metadata.
 *
 * `readSession` is passed in rather than imported so that the one place that
 * knows Stripe's field names stays `stripe.ts`. The webhook's session object is
 * the same shape a retrieve returns, and parsing it twice in two files is how
 * the two paths would eventually disagree about `payment_intent`.
 */
export async function applyStripeEvent(
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  readSession: (raw: Record<string, unknown>) => StripeSession,
  db: Queryer = query,
): Promise<WebhookOutcome> {
  if (STRIPE_GRANTING.has(event.type)) {
    return grantStripeSession(readSession(event.data.object), { origin: 'webhook', eventId: event.id }, db);
  }

  if (STRIPE_REVOKING.has(event.type)) {
    const charge = event.data.object;
    const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (!intent) return { applied: 'ignored', reason: 'refund names no payment intent' };

    /**
     * A partial refund still revokes the whole pack, and that is deliberate.
     *
     * Credits are indivisible and a pack is sold as one thing; refunding half of
     * a ten-pack does not describe five credits, it describes a goodwill
     * adjustment. `revoke()` clamps at zero, so somebody who has already spent
     * them is left at zero rather than in debt — the reasoning is in its header.
     */
    const rows = await db<{ id: string; credits: number; user_id: string | null }>(
      `update purchases set status = 'revoked'
        where store = 'stripe' and store_transaction_id = $1 and status = 'granted'
        returning id, credits, user_id`,
      [intent],
    );
    const purchase = rows[0];
    // Nothing granted under that intent, or already revoked. Both are the right
    // answer to a retried delivery.
    if (!purchase?.user_id) return { applied: 'duplicate' };
    await revoke(purchase.user_id, purchase.credits, `refunded (${event.type})`, db);
    return { applied: 'revoked', credits: purchase.credits, userId: purchase.user_id };
  }

  return { applied: 'ignored', reason: `type ${event.type || 'missing'}` };
}

// ---------------------------------------------------------------------------
// What somebody has actually bought
// ---------------------------------------------------------------------------

/**
 * One line on the account's payment history.
 *
 * Every field is read off the `purchases` row and none is computed from a live
 * Stripe call, which is the point: this is the record *this service* kept of a
 * transaction it honoured, and it has to answer the same way six weeks after a
 * refund, after an account deletion has nulled the user, and on a deployment
 * whose Stripe key has since been rotated. The document is fetched separately
 * and on demand — see `paymentDocument` — precisely so that a Stripe outage
 * degrades one button rather than the whole page.
 *
 * `amount` is minor units and may be null. RevenueCat does not always report a
 * price, and a row recorded before it did is a purchase that genuinely happened
 * for an amount we do not hold. It is reported as null and excluded from the
 * total rather than counted as zero — see `unpriced`.
 */
export interface PurchaseRecord {
  id: string;
  /** `stripe`, `app_store`, `play_store`. What the row was granted from. */
  store: string;
  productId: string;
  credits: number;
  amount: number | null;
  currency: string | null;
  status: 'granted' | 'revoked';
  at: number;
  /**
   * Whether asking for a document for this payment can possibly work.
   *
   * Only Stripe purchases have one we can produce: an App Store purchase's
   * receipt is in the buyer's Apple account and is not ours to hand over. Said
   * here so the interface does not draw a button that is going to answer 404.
   */
  documented: boolean;
}

export interface PurchaseHistory {
  purchases: PurchaseRecord[];
  /**
   * Total spent, **per currency**, over the purchases that were not refunded.
   *
   * A list rather than a number because two currencies cannot be added up, and
   * the alternative — converting them — would mean holding a rate, which is a
   * second price in this database by another name. Almost always one entry.
   */
  spent: { amount: number; currency: string }[];
  /** Previews bought and kept: the same rows, counted in credits. */
  credits: number;
  /** How many of those rows had no amount recorded. See `PurchaseRecord.amount`. */
  unpriced: number;
}

/**
 * The account's purchases, newest first.
 *
 * **Unlimited, and that is deliberate.** `history()` next door caps the ledger
 * at 50 because a ledger grows with every generation; this table grows only when
 * somebody completes a checkout, which for a consumable bought in packs of five
 * to twenty is tens of rows over a lifetime. The cap would buy nothing and would
 * make the total above it wrong — a "total spent" computed over the first page
 * of a paginated history is a number that quietly disagrees with the receipts
 * under it, which is worse than no total at all.
 *
 * The totals are computed here rather than in SQL for one practical reason: the
 * credit path is checked against `pg-mem`, which does not implement the
 * aggregate-with-filter forms this would want, and a total that cannot be tested
 * is a total nobody should trust.
 */
export async function purchaseHistory(userId: string, db: Queryer = query): Promise<PurchaseHistory> {
  const rows = await db<{
    id: string;
    store: string;
    product_id: string;
    credits: number;
    price_cents: number | null;
    currency: string | null;
    status: string;
    created_at: Date;
  }>(
    `select id, store, product_id, credits, price_cents, currency, status, created_at
       from purchases
      where user_id = $1
      order by created_at desc`,
    [userId],
  );

  // `Number()` rather than a `typeof` test on both counts: a driver is free to
  // hand an integer column back as a string, and a `price_cents` that arrived as
  // "999" would be read as "no amount recorded" — a total quietly missing a
  // purchase, which is the one failure a payment history must not have.
  const purchases: PurchaseRecord[] = rows.map((row) => ({
    id: row.id,
    store: row.store,
    productId: row.product_id,
    credits: Number(row.credits),
    amount: row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents),
    currency: row.currency,
    status: row.status === 'revoked' ? 'revoked' : 'granted',
    at: new Date(row.created_at).getTime(),
    documented: row.store === 'stripe',
  }));

  // Refunded rows are shown and not counted. They are part of the history — a
  // statement that hides a reversal is a statement nobody can reconcile — and
  // they are money that came back, so counting them in "spent" would overstate
  // what somebody has paid us by exactly the amount we returned to them.
  const kept = purchases.filter((purchase) => purchase.status === 'granted');

  const totals = new Map<string, number>();
  for (const purchase of kept) {
    if (purchase.amount === null || !purchase.currency) continue;
    totals.set(purchase.currency, (totals.get(purchase.currency) ?? 0) + purchase.amount);
  }

  return {
    purchases,
    spent: [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
    credits: kept.reduce((sum, purchase) => sum + purchase.credits, 0),
    unpriced: kept.filter((purchase) => purchase.amount === null || !purchase.currency).length,
  };
}

/** The payment behind one purchase, for the document route. Ownership is checked there. */
export async function purchaseFor(
  userId: string,
  purchaseId: string,
  db: Queryer = query,
): Promise<{ id: string; store: string; transactionId: string } | null> {
  const rows = await db<{ id: string; store: string; store_transaction_id: string }>(
    'select id, store, store_transaction_id from purchases where id = $1 and user_id = $2',
    [purchaseId, userId],
  );
  const row = rows[0];
  return row ? { id: row.id, store: row.store, transactionId: row.store_transaction_id } : null;
}
