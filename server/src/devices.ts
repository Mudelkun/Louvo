/**
 * Who is asking, in the absence of accounts.
 *
 * There are no accounts in Luvo yet — favourites and saved looks are
 * device-local and always have been. A preview backend still needs to know whose
 * job is whose, and inventing a login screen to answer that would be building
 * the wrong feature first.
 *
 * So: the phone generates 32 random bytes on first run, keeps them in the
 * platform keystore (`expo-secure-store`), and sends them as a bearer token. We
 * store **the hash**, never the secret, exactly the way a password is handled —
 * so the database this row lives in is not a database of credentials, and a leak
 * of it cannot be replayed as a device.
 *
 * What this is not: authentication of a *person*. Anyone holding the secret is
 * the device, a reinstall is a new device and loses the list of in-flight jobs
 * (not the looks — those are on the phone), and nothing here proves the caller
 * is a real copy of the app. That last one is what costs money, and the answer to
 * it is App Attest and Play Integrity, which is its own piece of work.
 *
 * `user_id` exists on the row from day one and nothing reads it. When accounts
 * land, adopting a device is `update devices set user_id = ...` and no job has to
 * move.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { query } from './db.js';

/** The secret is base64url of 32 bytes: 43 characters, no padding. */
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

export const deviceIdFor = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');

/**
 * Reads the device secret out of an `Authorization: Device <secret>` header.
 *
 * Returns null rather than throwing: whether a missing device is a 401 or a
 * silently anonymous request is the route's decision, not this function's.
 */
export function deviceSecretFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Device\s+(\S+)$/i.exec(header.trim());
  const secret = match?.[1];
  if (!secret || !SECRET.test(secret)) return null;
  return secret;
}

/**
 * Registers the device if it is new and stamps it as seen.
 *
 * Deliberately an upsert with no separate registration endpoint. A device that
 * has never been seen before is not an error state — it is the first preview
 * somebody ever generates — and an app that has to remember whether it has
 * enrolled is an app with a state machine and a failure mode where it thinks it
 * has and we think it has not.
 */
export async function touchDevice(deviceId: string): Promise<void> {
  await query(
    `insert into devices (id) values ($1)
     on conflict (id) do update set last_seen_at = now()`,
    [deviceId],
  );
}

/**
 * Whether this request came from a browser or from the app.
 *
 * It decides which anchor kind the device secret is registered under, and
 * therefore how large a free allowance it is granted — a browser gets fewer,
 * because `localStorage` is not a keystore. See `grantedFor` in `anchors.ts`.
 *
 * `Origin` is the signal, and it is a good one for a reason that is structural
 * rather than lucky: browsers set it on every cross-origin request and forbid
 * pages from overriding it, and native clients do not send it at all. The
 * explicit header is accepted alongside it so a future same-origin deployment,
 * where `Origin` may be absent, does not silently start granting browsers the
 * phone's allowance.
 *
 * **It is not a security boundary and must not be used as one.** A script can
 * send neither header and be granted a phone's allowance instead of a browser's
 * — which is one extra free generation, obtained with more effort than simply
 * clearing `localStorage`, which the anonymous ceiling in `abuse.ts` already
 * answers. Nothing here decides whether a request is authorised; it decides how
 * generous a first visit is.
 */
export function deviceKindFor(origin: unknown, client: unknown): 'device' | 'web' {
  if (typeof client === 'string' && client.trim().toLowerCase() === 'web') return 'web';
  return typeof origin === 'string' && origin.trim() ? 'web' : 'device';
}

export interface PushRegistration {
  token: string | null;
  platform: string | null;
}

export async function setPushToken(deviceId: string, { token, platform }: PushRegistration): Promise<void> {
  await query(
    `update devices set push_token = $2, push_platform = $3, last_seen_at = now() where id = $1`,
    [deviceId, token, platform],
  );
}

export async function pushTokenFor(deviceId: string): Promise<{ token: string; platform: string | null } | null> {
  const rows = await query<{ push_token: string | null; push_platform: string | null }>(
    'select push_token, push_platform from devices where id = $1',
    [deviceId],
  );
  const row = rows[0];
  return row?.push_token ? { token: row.push_token, platform: row.push_platform } : null;
}

/**
 * Compares two ids without leaking where they diverge.
 *
 * Overkill for a hash comparison that is already done by an indexed `where` in
 * Postgres, and here for the one case that is not: checking that the job a
 * request names belongs to the device that asked. That check is in application
 * code, on a value an attacker controls, and it costs nothing to do properly.
 */
export function sameDevice(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
