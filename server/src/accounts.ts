/**
 * Accounts, and the three ways of proving you are one.
 *
 * An account exists for exactly one reason: purchased credits have to survive a
 * phone. Free generations do not need one — that is the whole point of the free
 * two — and nothing else in Luvo does either, which is why favourites and
 * saved looks are still device-local files and why this module holds an id, an
 * email and nothing whatsoever about hair.
 *
 * ## Signing in adopts the device
 *
 * There is no session table and no second bearer token. The phone already holds
 * 32 random bytes in its keystore and already sends them on every request;
 * signing in sets `devices.user_id` — the column `003_previews.sql` created on
 * day one and left unread, with a comment predicting this exact update — and
 * from then on the device header identifies both the device and the person.
 *
 * A second token would have been the conventional answer and would have bought
 * nothing: it would live in the same keystore, be sent over the same channel and
 * be exactly as strong as the secret already there. What it would add is a
 * second expiry, a refresh flow, and a class of bug where a device is
 * authenticated and its user is not.
 *
 * Signing out is the same update with a null. The looks on the phone are files
 * and are not touched by it, because they were never ours.
 *
 * ## Why Apple *and* Google *and* email
 *
 * Not maximalism. Apple's guideline 4.8 requires an equivalent private
 * sign-in option wherever a third-party one is offered, and Sign in with Apple
 * satisfies it — so offering Google alone is not a shipping configuration. Email
 * is there because a person who uses neither should not be locked out of the
 * credits they paid for.
 *
 * ## What is verified, and what is merely believed
 *
 * Apple and Google identity tokens are verified properly: signature against the
 * provider's published keys, issuer, audience and expiry. `jose` does that
 * rather than fifty lines of `crypto.verify` here, because a hand-rolled JWT
 * verifier is the archetypal piece of security code that looks right and is not.
 *
 * The email address *inside* a verified token is believed, and that is a real
 * distinction worth keeping straight: Apple's private relay means the address
 * may be a forwarder, and Google's may be unverified on some accounts. Neither
 * is ever the identity — the identity is the provider's `sub`, which is stable
 * and cannot be changed by the user — so a believed email is only ever a label
 * on the account screen.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify } from 'jose';

import { newUserId } from './credits.js';
import { query, type Queryer } from './db.js';
import { env } from './env.js';

export const PROVIDERS = ['apple', 'google', 'email'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface Account {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: number;
}

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Identity verification
// ---------------------------------------------------------------------------

/**
 * One JWKS client per provider, created once.
 *
 * `createRemoteJWKSet` caches the keys and re-fetches only on a key it has not
 * seen, which is what makes this safe to call on every sign-in. Creating one per
 * request would fetch Apple's key set on every sign-in and rate-limit us out of
 * our own login.
 */
const jwks = {
  apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
  google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
};

export interface VerifiedIdentity {
  provider: Provider;
  subject: string;
  email: string | null;
}

async function verifyApple(token: string): Promise<VerifiedIdentity> {
  if (!env.auth.appleAudiences.length) {
    throw new AuthError('apple_unconfigured', 'this deployment has no Apple audience configured', 503);
  }
  const { payload } = await jwtVerify(token, jwks.apple, {
    issuer: 'https://appleid.apple.com',
    audience: env.auth.appleAudiences,
  }).catch(() => {
    throw new AuthError('apple_token_invalid', 'that Apple sign-in could not be verified');
  });
  if (!payload.sub) throw new AuthError('apple_token_invalid', 'the Apple token carried no subject');
  return { provider: 'apple', subject: payload.sub, email: emailFrom(payload.email) };
}

async function verifyGoogle(token: string): Promise<VerifiedIdentity> {
  if (!env.auth.googleAudiences.length) {
    throw new AuthError('google_unconfigured', 'this deployment has no Google client id configured', 503);
  }
  const { payload } = await jwtVerify(token, jwks.google, {
    // Google issues both spellings and has for years. Accepting one of them is a
    // bug that appears only on some accounts, which is the worst kind.
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.auth.googleAudiences,
  }).catch(() => {
    throw new AuthError('google_token_invalid', 'that Google sign-in could not be verified');
  });
  if (!payload.sub) throw new AuthError('google_token_invalid', 'the Google token carried no subject');
  return { provider: 'google', subject: payload.sub, email: emailFrom(payload.email) };
}

const emailFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.includes('@') ? value.trim().toLowerCase() : null;

// ---------------------------------------------------------------------------
// Email codes
// ---------------------------------------------------------------------------

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

export const normaliseEmail = (value: unknown): string | null => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EMAIL.test(email) && email.length <= 254 ? email : null;
};

const hashCode = (email: string, code: string): string =>
  createHash('sha256').update(`${email}:${code}:${env.anchorSalt}`).digest('hex');

/**
 * Mints a six-digit code and stores its hash.
 *
 * `randomInt` rather than `Math.random`, for the same reason `deviceId.ts` uses
 * the platform CSPRNG: a predictable code is not a code. One row per address, so
 * asking again replaces the previous code rather than leaving two valid — a
 * user who taps "resend" should not widen the window they are protected by.
 */
export async function issueEmailCode(email: string, db: Queryer = query): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + env.auth.emailCodeTtlSeconds * 1000);
  await db(
    `insert into email_codes (email, code_hash, attempts, expires_at)
     values ($1, $2, 0, $3)
     on conflict (email) do update set code_hash = $2, attempts = 0, expires_at = $3, created_at = now()`,
    [email, hashCode(email, code), expiresAt],
  );
  return code;
}

/**
 * Checks a code, once.
 *
 * Three guards, and each closes a different door: expiry bounds how long a
 * leaked code is worth anything, the attempt counter bounds guessing (six digits
 * is a million possibilities and an unbounded loop gets through them), and the
 * row is deleted on success so a code cannot be replayed. The comparison is
 * constant-time out of habit rather than necessity — it compares hashes, so
 * there is nothing much to learn from the timing, and doing it properly costs a
 * line.
 */
export async function consumeEmailCode(email: string, code: string, db: Queryer = query): Promise<void> {
  const rows = await db<{ code_hash: string; attempts: number; expires_at: Date }>(
    'select code_hash, attempts, expires_at from email_codes where email = $1',
    [email],
  );
  const row = rows[0];
  if (!row) throw new AuthError('code_not_found', 'ask for a new code');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db('delete from email_codes where email = $1', [email]);
    throw new AuthError('code_expired', 'that code has expired — ask for a new one');
  }
  if (row.attempts >= env.auth.emailCodeAttempts) {
    await db('delete from email_codes where email = $1', [email]);
    throw new AuthError('code_attempts', 'too many attempts — ask for a new code');
  }

  const expected = Buffer.from(row.code_hash, 'utf8');
  const actual = Buffer.from(hashCode(email, code.trim()), 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await db('update email_codes set attempts = attempts + 1 where email = $1', [email]);
    throw new AuthError('code_invalid', 'that code is not right');
  }

  await db('delete from email_codes where email = $1', [email]);
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export interface SignInRequest {
  provider: Provider;
  /** Apple/Google: the identity token. Email: the six-digit code. */
  token: string;
  /** Email only. Ignored for the other two — their token carries the subject. */
  email?: string | null;
  displayName?: string | null;
}

export async function verifyIdentity(request: SignInRequest): Promise<VerifiedIdentity> {
  if (request.provider === 'apple') return verifyApple(request.token);
  if (request.provider === 'google') return verifyGoogle(request.token);

  const email = normaliseEmail(request.email);
  if (!email) throw new AuthError('invalid_email', 'that does not look like an email address', 400);
  await consumeEmailCode(email, request.token);
  return { provider: 'email', subject: email, email };
}

/**
 * Finds the account this identity belongs to, or creates it.
 *
 * The lookup is on `(provider, subject)` and never on the email, which is the
 * one decision here with teeth. Matching on email would silently merge a Google
 * account and an Apple private-relay account that happen to forward to the same
 * inbox — and, far worse, would let anyone who can receive mail at an address
 * take over the account of whoever signed in with that address through a
 * provider. Two identities become one account only when a signed-in user adds
 * the second one deliberately, which `linkIdentity` is for.
 */
export async function upsertAccount(identity: VerifiedIdentity, displayName: string | null, db: Queryer = query) {
  const existing = await db<{ user_id: string }>(
    'select user_id from user_identities where provider = $1 and subject = $2',
    [identity.provider, identity.subject],
  );

  if (existing[0]) {
    const userId = existing[0].user_id;
    // Refresh the label, never the identity. A user who set a name keeps it.
    await db(
      `update users set email = coalesce($2, email),
                        display_name = coalesce(display_name, $3),
                        updated_at = now()
        where id = $1`,
      [userId, identity.email, displayName],
    );
    return { userId, created: false };
  }

  const userId = newUserId();
  await db('insert into users (id, email, display_name) values ($1, $2, $3)', [
    userId,
    identity.email,
    displayName,
  ]);
  await db('insert into user_identities (provider, subject, user_id, email) values ($1, $2, $3, $4)', [
    identity.provider,
    identity.subject,
    userId,
    identity.email,
  ]);
  // Created empty rather than on first purchase: a balance row that does not
  // exist and a balance of zero are the same fact, and one of them needs a
  // branch at every read.
  await db('insert into credit_balances (user_id, balance) values ($1, 0) on conflict (user_id) do nothing', [
    userId,
  ]);
  return { userId, created: true };
}

/** Adds a second way of signing in to an account that already exists. */
export async function linkIdentity(userId: string, identity: VerifiedIdentity, db: Queryer = query): Promise<void> {
  const existing = await db<{ user_id: string }>(
    'select user_id from user_identities where provider = $1 and subject = $2',
    [identity.provider, identity.subject],
  );
  if (existing[0] && existing[0].user_id !== userId) {
    throw new AuthError('identity_taken', 'that sign-in already belongs to another account', 409);
  }
  await db(
    `insert into user_identities (provider, subject, user_id, email) values ($1, $2, $3, $4)
     on conflict (provider, subject) do nothing`,
    [identity.provider, identity.subject, userId, identity.email],
  );
}

/** The update `003_previews.sql` predicted. Jobs already in flight come along. */
export async function adoptDevice(deviceId: string, userId: string | null, db: Queryer = query): Promise<void> {
  await db('update devices set user_id = $2, last_seen_at = now() where id = $1', [deviceId, userId]);
}

export async function getAccount(userId: string, db: Queryer = query): Promise<Account | null> {
  const rows = await db<{ id: string; email: string | null; display_name: string | null; created_at: Date }>(
    'select id, email, display_name, created_at from users where id = $1',
    [userId],
  );
  const row = rows[0];
  return row
    ? { id: row.id, email: row.email, displayName: row.display_name, createdAt: new Date(row.created_at).getTime() }
    : null;
}

export async function identitiesFor(userId: string, db: Queryer = query): Promise<Provider[]> {
  const rows = await db<{ provider: Provider }>('select provider from user_identities where user_id = $1', [userId]);
  return rows.map((row) => row.provider);
}

/**
 * Deletes the account, for real.
 *
 * App Store guideline 5.1.1(v) requires this to exist *in the app*, and to be a
 * deletion rather than a deactivation. The cascades do most of it: identities and
 * the balance go with the row. Two things deliberately survive and both are
 * `on delete set null` rather than an oversight:
 *
 * - **Purchases**, because a refund that arrives six weeks later has to
 *   reconcile against something, and a store transaction id with no user
 *   attached identifies nobody.
 * - **Ledger rows**, for the same reason, and because they are what a dispute is
 *   answered with.
 *
 * The free allowance is untouched on purpose. It belongs to the *device*, not to
 * the account, and deleting an account is not a way to be given two more.
 */
export async function deleteAccount(userId: string, db: Queryer = query): Promise<void> {
  await db('update devices set user_id = null where user_id = $1', [userId]);
  await db('delete from users where id = $1', [userId]);
}

/** A one-time code, or the reason there is not one. */
export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');
