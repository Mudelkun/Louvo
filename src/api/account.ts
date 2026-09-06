/**
 * Accounts and credits, from the app's side.
 *
 * The mirror of `server/src/account.ts`, and it inherits that module's one
 * structural idea: **there is no session token.** Signing in sets `user_id` on
 * this device's row, so the device header the app already sends on every request
 * is what identifies the account too. Nothing here stores a credential, because
 * there is not a second one to store.
 *
 * ## The balance is never computed here
 *
 * Every number this module returns came from the server, and none of it is
 * decremented locally on the way into a generation. That is the brief's rule —
 * the client is never trusted to decide how many credits a user has — and it has
 * a practical edge as well as a security one: a purchase made on an iPad or a
 * refund granted by Apple changes the balance without this app being involved,
 * so a locally-tracked number is a number that is quietly wrong.
 *
 * The cost is one round trip after anything that could have moved it, and
 * `AccountContext` is where that is arranged.
 */

import { API_BASE_URL, hasApi } from '@/api/client';
import { deviceHeader } from '@/lib/deviceId';

export type AuthProvider = 'apple' | 'google' | 'email';

export interface CreditState {
  /** Free generations left on this device. Survives a reinstall — see `installAnchor.ts`. */
  free: number;
  /** Purchased credits on the signed-in account. Zero when signed out. */
  credits: number;
  /** What a generation can be started with right now. */
  total: number;
  freeGranted: number;
  signedIn: boolean;
}

export interface Account {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: number;
  providers: AuthProvider[];
}

export interface AccountState {
  account: Account | null;
  credits: CreditState;
  /**
   * What to identify this user to RevenueCat as.
   *
   * Null until signed in, which is exactly why an account is required before
   * buying: a purchase made against an anonymous RevenueCat id has no account
   * for the webhook to credit, and the money would be genuinely gone.
   */
  purchaserId: string | null;
}

export interface CreditProduct {
  /** The store product id. What RevenueCat is asked to sell. */
  id: string;
  credits: number;
  /** `best_value` on the pack worth pointing at, or null. */
  badge: string | null;
}

export interface LedgerEntry {
  kind: string;
  source: 'free' | 'paid';
  delta: number;
  reason: string;
  at: number;
}

export class AccountError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
    this.status = status;
  }
}

/**
 * The state a build with no backend reports.
 *
 * Not zero, and that is deliberate. With no API there is no credit system at
 * all — generation falls through to the direct or simulated path, which the
 * server never sees and cannot meter — so reporting "no generations left" would
 * put a paywall in front of a build that has nothing to sell and no way to
 * charge. `Infinity` is the honest answer to "how many may I start", and
 * `creditsEnforced()` is what the UI actually branches on.
 */
export const UNMETERED: AccountState = {
  account: null,
  credits: { free: Number.POSITIVE_INFINITY, credits: 0, total: Number.POSITIVE_INFINITY, freeGranted: 0, signedIn: false },
  purchaserId: null,
};

/** Whether generations are counted at all in this build. */
export const creditsEnforced = (): boolean => hasApi();

const TIMEOUT_MS = 15_000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : null),
        ...(await deviceHeader()),
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new AccountError(
        typeof payload?.message === 'string' ? payload.message : `${path} -> ${response.status}`,
        typeof payload?.error === 'string' ? payload.error : 'request_failed',
        response.status,
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Who this device is and what it may generate with. Safe with no account. */
export async function fetchAccount(): Promise<AccountState> {
  if (!creditsEnforced()) return UNMETERED;
  return call<AccountState>('/v1/account');
}

/**
 * The balance and the packs, in one request.
 *
 * Split from `fetchAccount` because it is what the paywall polls while it waits
 * for a purchase webhook to land, and asking for the whole account payload to
 * watch one integer change would be wasteful at both ends.
 */
export async function fetchCredits(): Promise<{ credits: CreditState; products: CreditProduct[] }> {
  if (!creditsEnforced()) return { credits: UNMETERED.credits, products: [] };
  return call<{ credits: CreditState; products: CreditProduct[] }>('/v1/credits');
}

export async function fetchHistory(): Promise<LedgerEntry[]> {
  if (!creditsEnforced()) return [];
  return (await call<{ history: LedgerEntry[] }>('/v1/credits/history')).history;
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

export interface SignInRequest {
  provider: AuthProvider;
  /** Apple and Google: the identity token. Email: the six-digit code. */
  token: string;
  email?: string | null;
  displayName?: string | null;
}

export async function signIn(request: SignInRequest): Promise<AccountState> {
  return call<AccountState>('/v1/account/sign-in', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * Asks for a sign-in code.
 *
 * `devCode` comes back only from a deployment that has explicitly opted into
 * echoing it and has no mail provider configured — see `EMAIL_DEV_ECHO`. It is
 * shown in the UI when present, because a local checkout with no Resend key
 * otherwise has no way to test this path at all.
 */
export async function requestEmailCode(email: string): Promise<{ sent: boolean; devCode?: string }> {
  return call<{ sent: boolean; devCode?: string }>('/v1/account/email-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Adds a second sign-in method to the account this device is already in. */
export async function linkProvider(request: SignInRequest): Promise<AccountState> {
  return call<AccountState>('/v1/account/link', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * Signs out, which is one update on the server and nothing here.
 *
 * The looks and favourites on this phone are files and are deliberately not
 * cleared: they were made on this device, they belong to it, and they were never
 * part of the account. Clearing them is a separate, explicitly destructive
 * action in Settings.
 */
export async function signOut(): Promise<AccountState> {
  return call<AccountState>('/v1/account/sign-out', { method: 'POST' });
}

/**
 * Deletes the account and everything on it, including unspent credits.
 *
 * Required in-app by App Store guideline 5.1.1(v), and required to be a real
 * deletion. The caller must have said what is being lost before calling this —
 * a confirmation that does not mention the balance is a confirmation of the
 * wrong thing.
 */
export async function deleteAccount(): Promise<AccountState> {
  return call<AccountState>('/v1/account', { method: 'DELETE' });
}
