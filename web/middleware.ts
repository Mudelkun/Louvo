/**
 * Clerk's middleware, and the guard that keeps a keyless checkout running.
 *
 * `clerkMiddleware()` is what makes `auth()` and the client-side session work at
 * all; without it every Clerk hook reports signed-out forever, which is a
 * failure with no error message anywhere. So it is registered — but only when
 * there are keys, because it throws on a request when there are none, and a
 * fresh clone of this repository with no Clerk account has to still serve the
 * catalogue and the try-on. That is the same rule `hasApi` follows in
 * `lib/config.ts`: a missing key is a reported state, never a crash.
 *
 * **Nothing here protects anything.** No route is gated on being signed in and
 * none should be: the whole design of the anonymous tier is that somebody gets a
 * preview before being asked for anything, and the one thing that does depend on
 * an account — the credit ledger — is enforced by the API against the device
 * secret, not by this file. A `createRouteMatcher` protecting `/account` would
 * only add a redirect to a page that already renders correctly signed out.
 *
 * The matcher is Clerk's documented one: every path except Next's internals and
 * static files, plus the API routes.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const configured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

export default configured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Everything except Next internals and files with an extension, unless they
    // are named in a search parameter.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
