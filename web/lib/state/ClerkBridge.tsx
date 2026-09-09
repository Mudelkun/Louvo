'use client';

/**
 * The one place Clerk and Louvo's own account meet.
 *
 * Clerk answers *who is at this keyboard*. It does not know about device
 * secrets, free allowances or credits, and it must not: the ledger is the
 * server's, keyed on a device secret this browser has held since before anybody
 * signed in. So there are two facts in play — Clerk has a session, and the API
 * has adopted this device — and they can be out of step in both directions:
 *
 * - **Clerk signed in, Louvo not.** A fresh Google redirect, or a returning
 *   visitor whose Clerk cookie outlived their Louvo device secret. This adopts.
 * - **Clerk signed out, Louvo not.** Somebody signed out in another tab, or their
 *   Clerk session expired. This signs Louvo out to match, because a page offering
 *   to sign out of something the sign-in button would immediately re-enter is
 *   lying about its own state.
 *
 * The *third* case is not reconciled here, it is prevented: Louvo signed out
 * while Clerk stays signed in. That one cannot be fixed by watching, because
 * both sides look settled — this app shows "Sign in", Clerk answers every
 * attempt with `session_exists`, and there is no signal saying which of the two
 * is wrong. So sign-out tears down both halves at once instead;
 * `registerExternalSignOut` below is that wiring, and the note on it in
 * `AccountContext` is why it is a registered callback rather than a `useClerk()`
 * call over there.
 *
 * Reconciling rather than reacting to an event is the rest of the design. A
 * redirect back from Google is a *page load*, not a callback — there is no
 * promise to await and no handler guaranteed to run — so the only reliable
 * implementation compares the two states whenever either changes and closes the
 * gap. That also makes it idempotent, which matters because `grantSignupBonus`
 * is called on every sign-in and is only safe because it is a compare-and-set
 * server-side.
 *
 * It renders nothing. It is mounted inside both providers because it needs both.
 */

import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

import { useAccount } from './AccountContext';

export function ClerkBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const { credits, ready, adoptClerkSession, signOut, registerExternalSignOut } = useAccount();

  /**
   * The Clerk user the last adoption was attempted for.
   *
   * Not a boolean, because "have we adopted" is the wrong question once somebody
   * can switch accounts: signing out of one Google account and into another in
   * the same tab changes the id without ever passing through signed-out, and a
   * flag would leave the second account looking at the first one's credits.
   *
   * A ref rather than state so that a failed attempt does not re-render, and so
   * the effect does not depend on something it also sets.
   */
  const attemptedFor = useRef<string | null>(null);

  /**
   * Ending the Clerk session is part of signing out of Louvo.
   *
   * Registered rather than called directly from `AccountContext`, because that
   * provider also has to work in a build with no Clerk keys, where `useClerk()`
   * would throw. See its `registerExternalSignOut`.
   */
  useEffect(
    () => registerExternalSignOut(async () => void (await clerk.signOut())),
    [registerExternalSignOut, clerk],
  );

  useEffect(() => {
    // Both sides have to have answered before their disagreement means anything.
    // `ready` is false until the first successful account read, and adopting on a
    // state that is merely unknown would sign somebody in on every cold start.
    if (!isLoaded || !ready) return;

    if (!isSignedIn) {
      // Clear the guard so that signing back in — even as the same person, which
      // is the common case right after a sign-out — adopts again rather than
      // being mistaken for an attempt already made.
      attemptedFor.current = null;
      // Clerk ended somewhere else. Match it, so the header, the credits and the
      // account panel agree. When *we* started the sign-out this is already
      // false and the branch does nothing, which is why `signOut` clears its own
      // state before ending the Clerk session.
      if (credits.signedIn) void signOut().catch(() => undefined);
      return;
    }

    if (!user || attemptedFor.current === user.id) return;
    attemptedFor.current = user.id;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await adoptClerkSession(token, {
          email: user.primaryEmailAddress?.emailAddress ?? null,
          displayName: user.fullName ?? null,
        });
      } catch {
        // Left for the next change of state to retry. A failure here is not
        // something to put in front of somebody: they are signed into Clerk and
        // the page works, they simply have not been credited yet, and the dialog
        // that started this reports its own errors.
        attemptedFor.current = null;
      }
    })();
  }, [isLoaded, isSignedIn, user, ready, credits.signedIn, getToken, adoptClerkSession, signOut]);

  return null;
}
