/**
 * Rendering an amount the server was told by the till.
 *
 * ## What this replaced, and why the replacement is smaller
 *
 * `web/lib/pricing.ts` used to live here: three hardcoded figures, marked
 * indicative, drawn under a disabled button, because a pricing page with no
 * prices tests nothing and testing demand is the reason this site exists. That
 * was a stopgap with a stated expiry — "deleted when a Stripe Price lookup
 * replaces it" — and this is that deletion.
 *
 * So there are **no amounts in this file and none anywhere else in the web app.**
 * A price lives in exactly one place, which is the Stripe Price object that will
 * charge somebody; the server reads it per request and hands it over
 * (`CreditProduct.price`), and everything here does is format what arrived. That
 * is the same rule the phone runs on with StoreKit, reached by a different
 * route: we own the credits, the till owns the price.
 *
 * The consequence worth knowing is that a pack can arrive with `price: null` —
 * no Stripe key on the deployment, no Price pointed at the pack, or Stripe
 * unreachable for a label. That is drawn as "price not set yet", which is true,
 * rather than as a figure with nothing standing behind it.
 */

import type { Price } from './api';

/**
 * `$4.99`, in the reader's own locale.
 *
 * `undefined` as the locale rather than a fixed one, so somebody in Berlin gets
 * `4,99 $` — the separators are theirs and the currency is the till's, which is
 * the only combination that is not a small lie in one direction or the other.
 */
export function formatPrice(price: Price): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: 2,
  }).format(price.amount / 100);
}

/**
 * `$0.75` — the per-generation figure, which is the honest way to state the
 * saving on a larger pack.
 *
 * The 20-pack is deliberately **not** sold with a struck-through $19.99: it has
 * never been that price, so showing one would be a fictitious reference price
 * (EU Omnibus, FTC) and it reads as a trick. 75c a generation against a dollar
 * is the same saving, stated as something that is true. If a real promotion is
 * ever wanted, the compliant route is a genuine higher list price sold at for a
 * period, discounted through Stripe's own promotion machinery.
 */
export function formatUnit(price: Price, credits: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: 2,
  }).format(price.amount / credits / 100);
}

/**
 * A readable name for a pack.
 *
 * Derived from the credit count rather than stored, because the count *is* the
 * product — "10 previews" cannot drift from a row that says 10 the way a
 * hand-written label can.
 */
export const packName = (credits: number): string => `${credits} previews`;
