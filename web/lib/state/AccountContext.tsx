'use client';

/**
 * Credits, and the account they will one day hang off.
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
 * ## Sign-in is a seam, not a feature, yet
 *
 * Clerk is the plan. What is here is the shape it will fill: `signedIn` comes
 * from the server's own `credits.signedIn`, because the API's notion of an
 * account is the only one that can be right about a balance. When Clerk lands,
 * the change is a route handler that exchanges a Clerk session for the API's
 * `POST /v1/account/sign-in` and adopts this browser's device secret — the
 * server already does exactly that for Apple and Google, and `devices.user_id`
 * is the column it sets. Nothing in this provider's surface changes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchAccount, type AccountState, type CreditState } from '../api';
import { hasApi } from '../config';
import { hasDevice } from '../device';

const UNKNOWN: CreditState = { free: 0, credits: 0, total: 0, freeGranted: 0, signedIn: false };

export interface AccountValue {
  credits: CreditState;
  account: AccountState['account'];
  /** False until the first successful read. Not the same as "no credits". */
  ready: boolean;
  /** Whether a generation can be started right now. True while loading. */
  canGenerate: boolean;
  refresh: () => Promise<void>;
  /** Whether this browser can identify itself to the API at all. */
  usable: boolean;
}

const AccountContext = createContext<AccountValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState | null>(null);
  const [ready, setReady] = useState(false);
  const [usable, setUsable] = useState(true);

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

  const value = useMemo<AccountValue>(() => {
    const credits = state?.credits ?? UNKNOWN;
    return {
      credits,
      account: state?.account ?? null,
      ready,
      canGenerate: !ready || credits.total > 0,
      refresh,
      usable,
    };
  }, [state, ready, refresh, usable]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}
