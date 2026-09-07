/**
 * What a pack costs, until Stripe is the one saying so.
 *
 * ## Read this before adding a price anywhere else
 *
 * The rule this codebase runs on is **we own the credits, the store owns the
 * price**. `credit_products` maps a product id to a number of generations and
 * has no price column; the API has never sent one. A second copy of a price in
 * our own database is a number that eventually disagrees with the till, and on a
 * store it is worse than that — the store quotes in the visitor's currency, with
 * their tax, and we cannot.
 *
 * On the web that authority is a Stripe Price. Once checkout is wired, this file
 * is **deleted** and the numbers come from a Price lookup in a route handler.
 *
 * Until then a pricing page with no prices tests nothing, and testing demand is
 * the entire reason this site exists. So the intended figures live here, in one
 * place, marked as indicative — and the page says so out loud rather than
 * quoting them as though a checkout stood behind them. The figures are the ones
 * in `docs/credits.md`, unchanged: the same product means the same price
 * wherever somebody meets it.
 *
 * ## The 20-pack is not sold with a struck-through $19.99
 *
 * It never was that price, so showing one would be a fictitious reference price
 * (EU Omnibus, FTC) and it reads as a trick. It is sold as **75c a generation
 * against a dollar**, which is the same saving stated truthfully. If a genuine
 * promotion is wanted later, the compliant route is to list at the higher price,
 * sell at it for a period, and then run the discount through Stripe's own
 * promotion machinery.
 */

export interface IndicativePrice {
  /** Matches `credit_products.id` from the API. */
  productId: string;
  /** Minor units, so no float ever touches a price. */
  amount: number;
  currency: string;
}

/**
 * Keyed by the store product ids `005_credits.sql` seeds.
 *
 * A pack the API returns that is not in here shows its credit count and no
 * price, which is the honest degradation: a pack added to the database before
 * its Stripe Price exists is a pack nobody can be quoted a price for yet.
 */
export const INDICATIVE: IndicativePrice[] = [
  { productId: 'com.luvoai.luvo.credits.5', amount: 499, currency: 'USD' },
  { productId: 'com.luvoai.luvo.credits.10', amount: 999, currency: 'USD' },
  { productId: 'com.luvoai.luvo.credits.20', amount: 1499, currency: 'USD' },
];

export const priceFor = (productId: string): IndicativePrice | null =>
  INDICATIVE.find((entry) => entry.productId === productId) ?? null;

/** `$4.99`. Formatted by the platform so a locale gets its own separators. */
export function formatPrice(price: IndicativePrice): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: 2,
  }).format(price.amount / 100);
}

/** `75c each` — the per-generation figure, which is the honest saving. */
export function formatUnit(price: IndicativePrice, credits: number): string {
  const each = price.amount / credits / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: 2,
  }).format(each);
}

/**
 * A readable name for a pack.
 *
 * Derived from the credit count rather than stored, because the count *is* the
 * product — "10 previews" cannot drift from a row that says 10 the way a
 * hand-written label can.
 */
export const packName = (credits: number): string => `${credits} previews`;
