/**
 * Install anchors: what a device is, for the purpose of the free allowance.
 *
 * `devices.id` cannot answer that question on its own, and the reason is a
 * platform asymmetry rather than a design choice.
 *
 * On **iOS** the device secret lives in the Keychain, and Keychain items outlive
 * the app that wrote them. Delete Luvo, reinstall it, and `deviceId.ts` reads
 * back the same 32 bytes — so the device row is already stable across a
 * reinstall and nothing extra is needed.
 *
 * On **Android** the same secret lives in the Keystore, which is cleared with
 * the package. A reinstall mints a fresh secret, hashes to a fresh device id,
 * and — before this module existed — was handed two more free generations. So
 * Android additionally reports `ANDROID_ID`: stable per app-signing-key and
 * device, surviving a reinstall, reset only by a factory reset.
 *
 * Three properties worth stating, because the brief asks for something slightly
 * stronger than what any phone can actually provide:
 *
 * - **We store a salted hash, never the identifier.** What an allowance needs
 *   from an anchor is equality, and a hash has that. A raw `ANDROID_ID` in a
 *   database is a device identifier we have no use for.
 * - **Linking can only ever cost the device generations, never earn them.** A
 *   device's remaining allowance is the *minimum* across its anchors and a hold
 *   is taken against *all* of them. There is no arrangement of anchors that
 *   produces a third free generation.
 * - **A factory reset, a restore-as-new or a second phone defeats it**, and
 *   nothing here pretends otherwise. The real answer to a determined reinstaller
 *   is App Attest and Play Integrity; at about five cents a generation, that
 *   arms race costs more than it saves.
 *
 * This is also deliberately *not* fingerprinting. No IP address, no screen
 * metrics, no model string, nothing composed from them — that is against both
 * stores' rules and, being probabilistic, would refuse free generations to
 * people who had never had any.
 */

import { createHash } from 'node:crypto';

import { placeholders, query, type Queryer } from './db.js';
import { env } from './env.js';

/** The device's own keystore secret, and Android's `ANDROID_ID`. */
export const ANCHOR_KINDS = ['device', 'android_id'] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export interface Anchor {
  kind: AnchorKind;
  value: string;
}

/**
 * Salted, so the stored id is not a value anybody else can recompute.
 *
 * `ANCHOR_SALT` is a deployment secret. Rotating it resets every free allowance
 * — which is a thing to know before rotating it, not a thing to do casually.
 */
export const anchorIdFor = ({ kind, value }: Anchor): string =>
  createHash('sha256').update(`${kind}:${value}:${env.anchorSalt}`).digest('hex');

const ANDROID_ID = /^[0-9a-f]{16}$/i;

/**
 * Reads the anchors a request is claiming.
 *
 * The device id is always one of them, so a device that reports nothing still
 * has a stable anchor — which is the whole iOS case. Anything else arrives in
 * `X-Install-Anchor`, on *every* request rather than through a registration
 * call, so there is no ordering in which a fresh Android install submits its
 * first generation before we know what it is.
 *
 * A malformed value is dropped rather than rejected. The consequence of ignoring
 * a bad anchor is that this install gets its own allowance, which is the
 * pre-existing behaviour; the consequence of failing the request is that a phone
 * with an unreadable `ANDROID_ID` cannot generate at all.
 */
export function anchorsFrom(deviceId: string, header: string | string[] | undefined): Anchor[] {
  const anchors: Anchor[] = [{ kind: 'device', value: deviceId }];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return anchors;

  for (const part of raw.split(',').slice(0, 4)) {
    const [kind, ...rest] = part.trim().split(':');
    const value = rest.join(':').trim();
    if (kind === 'android_id' && ANDROID_ID.test(value)) {
      anchors.push({ kind: 'android_id', value: value.toLowerCase() });
    }
  }
  return anchors;
}

export interface AnchorState {
  ids: string[];
  /** Free generations left: the minimum across every anchor this device has. */
  remaining: number;
  granted: number;
}

/**
 * Registers this device's anchors and reports what they are owed.
 *
 * Everything is an upsert, because there is no "first run" to detect: a device
 * that has been seen a thousand times and one that has never been seen take the
 * same path, for the same reason `touchDevice` does.
 *
 * The allowance row is created here rather than at sign-up, so the two free
 * generations exist from the first request a phone ever makes — which is what
 * lets somebody try the app before there is an account to attach anything to.
 */
export async function registerAnchors(deviceId: string, anchors: Anchor[], db: Queryer = query): Promise<AnchorState> {
  const ids: string[] = [];

  for (const anchor of anchors) {
    const id = anchorIdFor(anchor);
    ids.push(id);
    await db(
      `insert into install_anchors (id, kind) values ($1, $2)
       on conflict (id) do update set last_seen_at = now()`,
      [id, anchor.kind],
    );
    await db(
      `insert into device_anchors (device_id, anchor_id) values ($1, $2)
       on conflict (device_id, anchor_id) do nothing`,
      [deviceId, id],
    );
    await db(
      `insert into free_allowance (anchor_id, granted) values ($1, $2)
       on conflict (anchor_id) do nothing`,
      [id, env.credits.freeGenerations],
    );
  }

  return { ids, ...(await allowanceFor(ids, db)) };
}

/**
 * What these anchors have left, as the minimum rather than the sum.
 *
 * The minimum is what makes the whole scheme one-directional. A reinstalled
 * Android phone presents a brand-new `device` anchor (untouched, two remaining)
 * alongside its old `android_id` one (spent, zero remaining), and the answer has
 * to be zero. Taking the maximum, or the sum, or the newest, would each hand out
 * exactly the free generations this module exists to withhold.
 */
export async function allowanceFor(
  anchorIds: string[],
  db: Queryer = query,
): Promise<{ remaining: number; granted: number }> {
  if (!anchorIds.length) return { remaining: 0, granted: 0 };
  const rows = await db<{ granted: number; used: number; held: number }>(
    `select granted, used, held from free_allowance where anchor_id in (${placeholders(anchorIds.length)})`,
    anchorIds,
  );
  if (!rows.length) return { remaining: 0, granted: 0 };
  return {
    remaining: Math.min(...rows.map((row) => Math.max(0, row.granted - row.used - row.held))),
    granted: Math.min(...rows.map((row) => row.granted)),
  };
}

/** Every anchor this device has ever presented. */
export async function anchorsForDevice(deviceId: string, db: Queryer = query): Promise<string[]> {
  const rows = await db<{ anchor_id: string }>('select anchor_id from device_anchors where device_id = $1', [
    deviceId,
  ]);
  return rows.map((row) => row.anchor_id);
}
