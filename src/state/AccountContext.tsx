/**
 * The account and its credits, for the whole app.
 *
 * One rule shapes every line of this file: **the balance shown is the balance
 * the server last reported, and nothing here ever adjusts it locally.** No
 * optimistic decrement when a generation starts, no optimistic increment when a
 * purchase resolves. Both are tempting and both are wrong for the same reason —
 * the number can move without this app being involved (a purchase on another
 * device, a refund granted by Apple, a generation that failed and was refunded)
 * and a locally-maintained copy is a copy that drifts.
 *
 * What replaces optimism is a refresh after anything that could have moved it,
 * which is one small request. `GenerationProvider` calls `refresh()` when a job
 * settles; the paywall calls `awaitCredit()` after a purchase.
 *
 * ## Loading is not zero
 *
 * `ready` exists so the UI can tell "no credits" from "we have not asked yet".
 * Without it, every cold start flashes a paywall for the half second before the
 * first response lands — which is the single most annoying thing a metered app
 * can do, and it would happen to people who have credits.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  creditsEnforced,
  deleteAccount as deleteAccountRequest,
  fetchAccount,
  fetchCredits,
  linkProvider,
  signIn as signInRequest,
  signOut as signOutRequest,
  UNMETERED,
  type Account,
  type AccountState,
  type CreditProduct,
  type CreditState,
  type SignInRequest,
} from '@/api/account';
import { forgetPurchaser } from '@/api/purchases';
import { forgetProviders } from '@/api/signIn';

interface AccountContextValue {
  account: Account | null;
  credits: CreditState;
  products: CreditProduct[];
  purchaserId: string | null;
  /** False until the first response lands. Never show a paywall while it is false. */
  ready: boolean;
  /** True while a refresh is in flight, for a spinner that is not a gate. */
  refreshing: boolean;
  /** Whether generations are metered in this build at all. */
  metered: boolean;
  /** Whether a generation can be started right now. */
  canGenerate: boolean;
  refresh: () => Promise<void>;
  signIn: (request: SignInRequest) => Promise<AccountState>;
  link: (request: SignInRequest) => Promise<AccountState>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Waits for a purchase's credits to actually arrive. See below. */
  awaitCredit: (before: number) => Promise<boolean>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * How long to wait for a purchase webhook, and how often to look.
 *
 * The purchase resolves on the phone when the *store* is satisfied; the credits
 * arrive when RevenueCat's webhook reaches our server. That is usually well
 * under a second and occasionally several, so the paywall polls rather than
 * guessing. Fifteen seconds is the point at which telling somebody "this is
 * taking longer than usual, your credits will appear shortly" is more useful
 * than another spinner — and by then the purchase is recorded at the store, so
 * the credits do arrive whether or not anyone is watching.
 */
const CREDIT_WAIT_MS = 15_000;
const CREDIT_POLL_MS = 1_000;

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccountState>(UNMETERED);
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [ready, setReady] = useState(!creditsEnforced());
  const [refreshing, setRefreshing] = useState(false);

  /**
   * One refresh at a time, and the last one wins.
   *
   * Several things ask for a refresh at once on a cold start — the provider
   * mounting, the app coming to the foreground, a job settling — and three
   * simultaneous requests would resolve in any order, so the oldest answer could
   * be the one that lands last. The counter makes a stale response a no-op.
   */
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!creditsEnforced()) {
      setState(UNMETERED);
      setReady(true);
      return;
    }
    const mine = ++generation.current;
    setRefreshing(true);
    try {
      const [next, credits] = await Promise.all([fetchAccount(), fetchCredits()]);
      if (mine !== generation.current) return;
      setState({ ...next, credits: credits.credits });
      setProducts(credits.products);
    } catch {
      // Deliberately silent, and deliberately not a reset to zero. A failed
      // refresh means we do not know the balance right now, not that it is
      // empty — and blanking it would put a paywall in front of somebody whose
      // train went into a tunnel. The previous answer stands until a better one
      // arrives, and the generation itself is gated by the server anyway.
    } finally {
      if (mine === generation.current) {
        setRefreshing(false);
        setReady(true);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Re-check on every return to the foreground.
   *
   * The same reason `GenerationProvider` reconciles there: the phone may have
   * been closed for a day, a purchase may have been made on another device, and
   * a job may have finished and settled its credit while the app was away.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const signIn = useCallback(
    async (request: SignInRequest) => {
      const next = await signInRequest(request);
      generation.current++;
      setState(next);
      setReady(true);
      // The purchaser identity has changed, so RevenueCat has to be told before
      // the next purchase — otherwise it is credited to whoever was here before.
      forgetPurchaser();
      void refresh();
      return next;
    },
    [refresh],
  );

  const link = useCallback(async (request: SignInRequest) => {
    const next = await linkProvider(request);
    setState(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    const next = await signOutRequest();
    generation.current++;
    setState(next);
    forgetPurchaser();
    await forgetProviders();
  }, []);

  const deleteAccount = useCallback(async () => {
    const next = await deleteAccountRequest();
    generation.current++;
    setState(next);
    forgetPurchaser();
    await forgetProviders();
  }, []);

  /**
   * Waits until the balance is genuinely higher than it was before the purchase.
   *
   * Compares against a number the caller captured *before* opening the store
   * sheet, rather than looking for a specific amount: the pack's size is known,
   * but so is the possibility that a previous purchase's webhook lands in the
   * same window, and "more than before" is the question actually being asked.
   *
   * Returns false on timeout rather than throwing. A timeout is not a failed
   * purchase — the money is taken and the webhook will arrive — so the caller
   * says so honestly instead of showing an error for something that worked.
   */
  const awaitCredit = useCallback(async (before: number) => {
    const deadline = Date.now() + CREDIT_WAIT_MS;
    while (Date.now() < deadline) {
      try {
        const { credits } = await fetchCredits();
        if (credits.credits > before) {
          generation.current++;
          setState((previous) => ({ ...previous, credits }));
          return true;
        }
      } catch {
        // Keep waiting: a dropped poll is not an answer.
      }
      await new Promise((resolve) => setTimeout(resolve, CREDIT_POLL_MS));
    }
    void refresh();
    return false;
  }, [refresh]);

  const value = useMemo<AccountContextValue>(
    () => ({
      account: state.account,
      credits: state.credits,
      products,
      purchaserId: state.purchaserId,
      ready,
      refreshing,
      metered: creditsEnforced(),
      // While we are still asking, the answer is yes. See the header: a paywall
      // that flashes on every cold start is worse than a generation that is
      // refused by the server a moment later, and the server is the real gate.
      canGenerate: !creditsEnforced() || !ready || state.credits.total > 0,
      refresh,
      signIn,
      link,
      signOut,
      deleteAccount,
      awaitCredit,
    }),
    [state, products, ready, refreshing, refresh, signIn, link, signOut, deleteAccount, awaitCredit],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}
