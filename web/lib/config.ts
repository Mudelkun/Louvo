/**
 * Everything the web build reads from its environment, in one place.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this module is safe on both
 * sides of the server/client boundary and every value here is public by
 * construction. Nothing secret may be added to it — Clerk's secret key and
 * Stripe's live key belong in a route handler's `process.env`, never here.
 *
 * The pattern is the app's: a missing value is a *reported state* rather than a
 * crash or a silent guess. `hasApi` is false with no `NEXT_PUBLIC_API_URL`, the
 * catalog falls back, and the footer says which of the two answered — the same
 * rule `catalogSource()` follows in `src/api/client.ts`.
 */

const trim = (value: string | undefined): string | null => {
  const clean = value?.trim().replace(/\/$/, '');
  return clean ? clean : null;
};

/**
 * The Luvo API. Everything real comes from here: the catalog, the renders, the
 * generation queue, the credit ledger.
 *
 * A local checkout points it at the in-memory sandbox — `npm run sandbox` in the
 * repo root, which serves the whole backend on :8099 with nothing behind it and
 * no way to spend money. See `docs/sandbox.md`.
 */
export const API_URL = trim(process.env.NEXT_PUBLIC_API_URL);

export const hasApi = !!API_URL;

/**
 * This site's own origin, for canonical links, Open Graph tags and the share
 * links minted against it.
 *
 * Falls back to the Vercel-provided URL on a preview deployment so a branch
 * build does not advertise production's canonical, and to localhost otherwise.
 */
export const SITE_URL =
  trim(process.env.NEXT_PUBLIC_SITE_URL) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
  'http://localhost:3000';

/**
 * Whether sign-in is wired up.
 *
 * Clerk is the plan and is not implemented yet, so this is false everywhere
 * today and the account surface says so plainly rather than showing a button
 * that does nothing. `lib/auth.ts` is the seam.
 */
export const hasClerk = !!trim(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Whether checkout is wired up.
 *
 * Stripe is the plan and is not implemented yet. The pricing page is real, the
 * packs are real, and the buy button says "coming soon" rather than opening a
 * checkout that 500s — a broken payment button is worse than an absent one, the
 * same argument the landing page makes about store links in `server/src/env.ts`.
 */
export const hasStripe = !!trim(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

/** How long the browser waits on the API before calling it unreachable. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * How often a running generation is polled.
 *
 * The same two seconds the app uses, and for the same reason: the server reports
 * a *stage*, not a percentage, so the gap between reports is what the client
 * eases across. Longer and the wait screen visibly steps; shorter and it is
 * requests spent to learn nothing.
 */
export const POLL_INTERVAL_MS = 2_000;
