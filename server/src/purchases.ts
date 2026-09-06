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
import { query, type Queryer } from './db.js';

export interface CreditProduct {
  id: string;
  credits: number;
  badge: string | null;
}

/** What the app shows on the paywall, joined against the store's own prices. */
export async function creditProducts(db: Queryer = query): Promise<CreditProduct[]> {
  const rows = await db<{ id: string; credits: number; badge: string | null }>(
    'select id, credits, badge from credit_products where published = true order by sort_order',
  );
  return rows;
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
