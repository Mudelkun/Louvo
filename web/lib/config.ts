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
 * The Louvo API. Everything real comes from here: the catalog, the renders, the
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
 * Whether Clerk is configured, which decides how this browser signs in.
 *
 * This flag was deliberately absent while Clerk was a plan, on the argument that
 * sign-in was a six-digit code from the API this file already names and that a
 * second flag would only be a way for the two to disagree. The note ended by
 * saying that when Clerk landed it would want a publishable key and this is
 * where it would go. It has, and this is it.
 *
 * The old argument does not apply to what is here now, because `hasApi` and this
 * are not about the same thing: one is whether there is a backend, the other is
 * which of two doors it is reached through. With a key, `/sign-in` mounts
 * Clerk's own card — Google, Apple, and Clerk's emailed code; without one the
 * same page falls back to `<EmailCodeForm>` against `/v1/account/email-code`,
 * signing in as provider `email`. Both end at the same route and the same
 * adopted device.
 *
 * The fallback is not decoration. `<ClerkProvider>` throws outright with no
 * publishable key, so without this flag a fresh clone of the repository — and
 * the sandbox, which is a whole backend in memory with no keys at all — could
 * not render a page, let alone sign anybody in.
 */
export const hasClerk = !!trim(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/*
 * There is no `hasStripe` here any more, and its absence is not the same story
 * as the flag above it.
 *
 * `hasClerk` earns its place because it decides something about *this* bundle:
 * whether `<ClerkProvider>` can be rendered at all. Nothing equivalent is true
 * of payments — checkout is **hosted**, the visitor leaves for Stripe's own page
 * and comes back, so no card field, no Stripe.js and no publishable key ever
 * exist in this build. There is nothing here for a Stripe flag to configure.
 *
 * What was here read `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to decide whether to
 * draw a Buy button or the words "coming soon". That was a *guess about a server
 * setting* made by a different program: the key that decides whether anybody can be
 * charged is `STRIPE_SECRET_KEY` on the API, and a build with the publishable
 * key set and the API without its own would have shown a button that 503s.
 *
 * Checkout is hosted — the visitor leaves for Stripe's own page and comes back —
 * so the browser needs no Stripe key of any kind, and nothing in this bundle
 * configures payments. `/v1/credits` reports `checkout: true|false` from the
 * process that actually holds the key, in the same shape `catalogSource()`
 * reports where the catalogue came from, and `<Pricing>` renders that answer.
 */

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
