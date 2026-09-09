'use client';

/**
 * Credits, and the account they hang off.
 *
 * The rule this provider exists to keep is one sentence from the brief: **the
 * client is never trusted with the balance.** So there is no optimistic
 * decrement when a generation starts and no optimistic increment when a purchase
 * lands. The number moves without this tab being involved — another device, a
 * refund, a refunded failure — and a local copy drifts within a day.
 *
 * Two states must not be conflated, and the app learned this the hard way:
 * **`ready: false` is not "no credits"**. `canGenerate` is therefore true while
 * loading, because a paywall that flashes on a cold start lands on people who
 * have twenty; and a failed refresh keeps the previous answer rather than
 * blanking to zero.
 *
 * ## Sign-in is real, and it is one email and one code
 *
 * `signIn` and `signOut` are the two calls, and neither of them stores anything.
 * Signing in **adopts this browser's device**: the server sets `devices.user_id`
 * on the device secret it already trusts, so `Authorization: Device <secret>` is
 * the only credential this browser ever holds and there is no session token to
 * expire, refresh, or get out of step with the device. That is why the surface
 * here is two functions and not a session object.
 *
 * Both set the state from the **server's own reply** rather than adjusting the
 * previous one. The reply to a sign-in is the same document `/v1/account`
 * returns — it is the balance on the account that was just adopted, which is
 * exactly the number a local edit could not have worked out, since the whole
 * point of signing in is that credits arrive from somewhere this browser has
 * never seen.
 *
 * Clerk remains the seam it always was, and nothing here changes when it lands:
 * `server/src/accounts.ts` verifies Apple, Google, email and Clerk identically
 * and adopts the device the same way for all four, so a second provider is a
 * different token handed to the same route.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  confirmCheckout,
  fetchAccount,
  signInWithClerk,
  signInWithCode,
  signOut as signOutRequest,
  type AccountState,
  type CreditState,
  type SignInResult,
} from '../api';
import { announceGrant } from '../celebrate';
import { hasApi } from '../config';
import { hasDevice } from '../device';

const UNKNOWN: CreditState = { free: 0, credits: 0, total: 0, freeGranted: 0, signedIn: false };

/**
 * What happened at Stripe, if this page load is a return from it.
 *
 * `null` almost always. It is set from the query string `checkout.ts` builds
 * into `success_url` and `cancel_url`, and it lives here rather than on
 * `/account` because **the return lands wherever the visitor bought from** — the
 * cut they ran out of credits on, most of the time, which is the entire reason
 * `<TopUpDialog>` is a dialogue over the page instead of a trip to a balance.
 * One provider that every page already sits inside is the only place that can
 * answer for all of them.
 */
export type CheckoutOutcome = 'confirming' | 'bought' | 'pending' | 'cancelled' | 'failed';

export interface AccountValue {
  credits: CreditState;
  account: AccountState['account'];
  /** False until the first successful read. Not the same as "no credits". */
  ready: boolean;
  /** Whether a generation can be started right now. True while loading. */
  canGenerate: boolean;
  refresh: () => Promise<void>;
  /**
   * Signs in with a mailed code, creating the account if the address has none.
   *
   * Throws `ApiError` on a refusal — a wrong code, an expired one, too many
   * attempts — because those are four different things the dialog says four
   * different ways, and a boolean cannot tell them apart.
   */
  signIn: (email: string, code: string) => Promise<SignInResult>;
  /**
   * Hands a verified Clerk session to the API, which adopts this browser's
   * device secret onto the account behind it. Driven by `<ClerkBridge>`.
   */
  adoptClerkSession: (
    token: string,
    label?: { email?: string | null; displayName?: string | null },
  ) => Promise<SignInResult>;
  /**
   * Signs out of the API **and** of whatever established the identity.
   *
   * Both halves, always. See `registerExternalSignOut`.
   */
  signOut: () => Promise<void>;
  /**
   * Lets an identity provider be torn down by the same call that signs out here.
   *
   * This exists because signing out was, for a while, half a sign-out: it set
   * `devices.user_id` to null and left the Clerk session alone. The result was a
   * browser that this app considered signed out and Clerk considered signed in —
   * so the header offered "Sign in", and every attempt to use it came back
   * `session_exists` ("You're already signed in"), with no way forward from
   * either side.
   *
   * A callback registered from outside rather than a Clerk call in here, because
   * this provider has to work in a deployment with **no Clerk keys at all** —
   * `<ClerkProvider>` throws without a publishable key, so a `useClerk()` in this
   * file would take the whole site down in exactly the checkout that is supposed
   * to degrade gracefully. `<ClerkBridge>` registers it when there is a Clerk to
   * register, and nothing does when there is not.
   *
   * Returns its own unregister function, so a remount cannot leave a stale
   * closure behind.
   */
  registerExternalSignOut: (handler: () => Promise<void>) => () => void;
  /** Whether this browser can identify itself to the API at all. */
  usable: boolean;
  /** Set only on a page load that came back from Stripe. See `CheckoutOutcome`. */
  checkout: CheckoutOutcome | null;
  /**
   * Previews the returning purchase was worth, so the receipt can say `+5`.
   *
   * The server's `purchased`, held here only so `<CheckoutBanner>` can name the
   * amount without asking again. Zero for every outcome that bought nothing —
   * cancelled, pending, and a confirmation we could not read back.
   */
  checkoutCredits: number;
  dismissCheckout: () => void;
}

const AccountContext = createContext<AccountValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState | null>(null);
  const [ready, setReady] = useState(false);
  const [usable, setUsable] = useState(true);
  const [checkout, setCheckout] = useState<CheckoutOutcome | null>(null);
  const [checkoutCredits, setCheckoutCredits] = useState(0);

  const refresh = useCallback(async () => {
    if (!hasApi) return;
    if (!hasDevice()) {
      setUsable(false);
      return;
    }
    try {
      const next = await fetchAccount();
      setState(next);
      setReady(true);
      setUsable(true);
    } catch {
      // Deliberately keeps the previous answer. A dropped request is not news
      // about somebody's balance, and showing it as zero would put a paywall in
      // front of a paying customer because their wifi hiccuped.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Re-read when the tab comes back to the front.
   *
   * The equivalent of the app's foreground refresh, and it matters for the same
   * reason: a purchase completed in a Stripe tab, or a generation finished on a
   * phone, changes this number while nobody is looking at it.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  /**
   * Back from Stripe, on whichever page the purchase was started from.
   *
   * Two things happen here and only one of them is about money. The credits are
   * granted by the **webhook**, which is the authority and needs nothing from
   * this browser; `confirmCheckout` asks the server to read the session back
   * from Stripe *now*, so the balance is right by the time the page repaints
   * rather than a second or two later. `applied: 'duplicate'` is as good an
   * answer as `'granted'` — it means the webhook won the race.
   *
   * The query string is then **removed from the address bar**, and that is not
   * cosmetic: a reload would otherwise re-confirm the session, and a url copied
   * to somebody would carry a session id for no reason. `replaceState` rather
   * than a router navigation, so Back still goes back to wherever the visitor
   * was before they bought anything, and so this does not re-render the page
   * under them.
   *
   * `paid: false` is its own outcome and is not an error. A delayed payment
   * method — a bank debit — completes the session and settles hours or days
   * later, so the honest thing to say is that it is on its way.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('checkout');
    if (!outcome) return;

    const sessionId = params.get('session_id');
    params.delete('checkout');
    params.delete('session_id');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);

    if (outcome !== 'success' || !sessionId) {
      setCheckout(outcome === 'cancelled' ? 'cancelled' : null);
      return;
    }

    setCheckout('confirming');
    void confirmCheckout(sessionId)
      .then((result) => {
        setCheckout(result.paid ? 'bought' : 'pending');
        setCheckoutCredits(result.purchased);
        /**
         * The one place a purchase is announced, and it is announced with the
         * server's two numbers: what was bought and what the balance is now.
         *
         * It is a presentation cue and nothing else — see `lib/celebrate.ts`.
         * Deliberately *not* a state change here: this provider owns the balance
         * and does not own the fact that three components are about to spend a
         * second and a half agreeing about it. `refresh()` in the `finally` is
         * still what puts the new number into the tree.
         */
        if (result.paid) announceGrant(result.purchased, result.credits.total);
      })
      // The purchase is not in doubt — Stripe took the money and the webhook
      // will land. Only our reading of it failed, so this is reported as that
      // rather than as a failed payment.
      .catch(() => setCheckout('failed'))
      .finally(() => void refresh());
  }, [refresh]);

  /**
   * The reply is the new state, not a reason to go and ask for one.
   *
   * `/v1/account/sign-in` returns the same document `/v1/account` does, for the
   * device it has just adopted, so a refresh straight afterwards would be a
   * second request for an answer already in hand — and a window in which the
   * header still says "Sign in" to somebody who just did.
   */
  const signIn = useCallback(async (email: string, code: string) => {
    const result = await signInWithCode(email, code);
    setState({ account: result.account, credits: result.credits, purchaserId: result.purchaserId });
    setReady(true);
    setUsable(true);
    return result;
  }, []);

  /**
   * The same adoption, from a Clerk session rather than a mailed code.
   *
   * Called by `<ClerkBridge>` rather than by any button, because a Google
   * sign-in comes back as a page load and not as a resolved promise — see that
   * file. It is written to be safe to call repeatedly: the server's
   * `grantSignupBonus` is a compare-and-set, so a second adoption of the same
   * account grants nothing and this simply re-reads the state.
   */
  const adoptClerkSession = useCallback(
    async (token: string, label: { email?: string | null; displayName?: string | null } = {}) => {
      const result = await signInWithClerk(token, label);
      setState({ account: result.account, credits: result.credits, purchaserId: result.purchaserId });
      setReady(true);
      setUsable(true);
      return result;
    },
    [],
  );

  /**
   * Whatever else has to be torn down when this browser signs out. See
   * `registerExternalSignOut` on `AccountValue`.
   */
  const externalSignOut = useRef<(() => Promise<void>) | null>(null);

  const registerExternalSignOut = useCallback((handler: () => Promise<void>) => {
    externalSignOut.current = handler;
    return () => {
      if (externalSignOut.current === handler) externalSignOut.current = null;
    };
  }, []);

  /**
   * Signs out here first, then wherever the identity came from.
   *
   * The order is deliberate. Ending the Clerk session first would leave a moment
   * in which Clerk is signed out and this app still believes it is signed in —
   * which is precisely the state `<ClerkBridge>` reconciles by calling *this
   * function*, so it would re-enter while already running. Clearing our own
   * state first makes that branch a no-op by the time it is evaluated.
   *
   * The external half is allowed to fail without failing the sign-out. Being
   * signed out of Louvo and still signed into Clerk is recoverable — the bridge
   * notices and the next sign-in adopts — whereas a rejection here would leave
   * the button spinning over a sign-out that had, in fact, already happened.
   */
  const signOut = useCallback(async () => {
    setState(await signOutRequest());
    setReady(true);
    try {
      await externalSignOut.current?.();
    } catch {
      // Deliberately swallowed — see above.
    }
  }, []);

  const dismissCheckout = useCallback(() => setCheckout(null), []);

  const value = useMemo<AccountValue>(() => {
    const credits = state?.credits ?? UNKNOWN;
    return {
      credits,
      account: state?.account ?? null,
      ready,
      canGenerate: !ready || credits.total > 0,
      refresh,
      signIn,
      adoptClerkSession,
      signOut,
      registerExternalSignOut,
      usable,
      checkout,
      checkoutCredits,
      dismissCheckout,
    };
  }, [
    state,
    ready,
    refresh,
    signIn,
    adoptClerkSession,
    signOut,
    registerExternalSignOut,
    usable,
    checkout,
    checkoutCredits,
    dismissCheckout,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}
