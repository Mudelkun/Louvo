'use client';

/**
 * Where Google sends the visitor back to.
 *
 * `<AuthenticateWithRedirectCallback>` is the whole of it: it reads the result
 * out of the url, completes the sign-in or the sign-up, activates the session,
 * and then navigates to the `redirectUrlComplete` the dialog set — which is the
 * exact url the visitor left, so a Google sign-in started from a style page with
 * a photograph loaded comes back to that page with it still loaded.
 *
 * Nothing adopts the device here, and that is deliberate rather than an
 * omission. A redirect returns as a *page load*: this component's job ends the
 * moment it hands control to the destination, and an adoption started here would
 * be a request racing a navigation. `<ClerkBridge>` does it instead, by noticing
 * on the destination page that Clerk has a session the API has not been told
 * about — see that file for why reconciling beats reacting.
 *
 * The markup is a holding screen rather than a spinner, and it is one somebody
 * sees for a fraction of a second. It exists so that a slow round trip is a page
 * that says what is happening rather than a blank near-black rectangle, which
 * reads as a crash.
 */

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallback() {
  return (
    <main className="grid min-h-[60svh] place-items-center px-6 py-24 text-center">
      <div>
        <p className="font-display text-[clamp(1.4rem,4vw,1.9rem)] leading-tight text-ink">
          Signing you in…
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          One moment — you will be taken back to where you were.
        </p>
      </div>
      <AuthenticateWithRedirectCallback />
    </main>
  );
}
