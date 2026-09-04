/**
 * Share links, the events they generate, and who they brought in.
 *
 * The data layer for sharing, in the same relation to `shares.ts` as `jobs.ts`
 * is to `previews.ts`. Three ideas are worth having in mind before reading the
 * SQL, because each one is a decision rather than a detail.
 *
 * ## A link points at a hairstyle, never at an image
 *
 * The picture the sharer posts is on their phone and goes to whichever app they
 * chose; nothing about it reaches this table. What a link carries is a
 * *hairstyle id* — so the landing page can show the catalog's own mannequin
 * render of that cut, which is public, CDN-hosted and identical for everybody
 * who shared it. The recipient sees the haircut, not the sharer's face, and the
 * privacy promise `docs/preview-generation.md` makes survives a feature whose
 * entire purpose is to put the result in front of strangers.
 *
 * ## The counters are on the row, the detail is in the log
 *
 * `share_links.opens` is incremented in the same statement that stamps
 * `last_opened_at`, because the landing page is the hot path and the funnel's
 * headline number should not be a `count(*)` over an append-only log. The log is
 * still written — it is where "which platform, from which device, at what time"
 * lives — but nothing reads it to answer "how many".
 *
 * ## Attribution is first-write-wins, and it is honest about what it can see
 *
 * A device is attributed to the first share link it ever arrived on and never
 * re-attributed. What this can genuinely observe is a link opened *by an
 * installed app* — the OS hands us the code, and the device tells us. What it
 * cannot observe, and does not pretend to, is somebody installing from a store
 * listing on iOS: there is no deferred deep link without a third-party SDK, and
 * a `source` of `referrer` exists for the Android install-referrer case whenever
 * a native module is added to read it. Nothing writes an attribution the app did
 * not actually report.
 */

import { randomBytes } from 'node:crypto';

import { query } from './db.js';
import type { Gender, HairLengthId, HairTypeId } from './types.js';

export interface ShareLinkRow {
  code: string;
  device_id: string | null;
  hairstyle_id: string;
  hairstyle_name: string;
  gender: Gender | null;
  hair_type: HairTypeId | null;
  length_id: HairLengthId | null;
  channel: string | null;
  client_ref: string | null;
  opens: number;
  installs: number;
  signups: number;
  created_at: Date;
  last_opened_at: Date | null;
}

const COLUMNS = `code, device_id, hairstyle_id, hairstyle_name, gender, hair_type, length_id,
  channel, client_ref, opens, installs, signups, created_at, last_opened_at`;

/**
 * base62, ten characters.
 *
 * Short enough to read out over a table and long enough that the space is 62^10
 * — about 8x10^17 — so a link is not a directory of what other people have
 * generated. Not base64url, because a code ends up in a Play Store `referrer`
 * parameter and in other people's chat clients, and `-` and `_` are exactly the
 * two characters those tend to mangle or turn into a word break.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newShareCode(): string {
  // No rejection loop. 62 does not divide 256, so the modulo skews the first
  // eight letters by about 1.6% — which matters for a key and does not matter
  // for an opaque handle with 10^17 of room. Said out loud rather than hidden.
  const bytes = randomBytes(10);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** A code that could plausibly be one of ours. Cheap rejection before a query. */
export const isShareCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9]{6,32}$/.test(value);

export interface NewShareLink {
  code: string;
  deviceId: string;
  hairstyleId: string;
  hairstyleName: string;
  gender: Gender | null;
  hairType: HairTypeId | null;
  lengthId: HairLengthId | null;
  channel: string | null;
  clientRef: string | null;
}

/**
 * Mints a link, or returns the one this device already made for this look.
 *
 * The conflict target is the unique index in the migration, so a client that
 * retries a create after a dropped response gets its original code back and the
 * funnel counts one share rather than two. A create with no `clientRef` always
 * mints: nulls are distinct in Postgres, and a caller who sent no key has said
 * it does not care.
 */
export async function createShareLink(link: NewShareLink): Promise<ShareLinkRow> {
  const rows = await query<ShareLinkRow>(
    `insert into share_links
       (code, device_id, hairstyle_id, hairstyle_name, gender, hair_type, length_id, channel, client_ref)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (device_id, client_ref)
       do update set channel = coalesce(share_links.channel, excluded.channel)
     returning ${COLUMNS}`,
    [
      link.code,
      link.deviceId,
      link.hairstyleId,
      link.hairstyleName,
      link.gender,
      link.hairType,
      link.lengthId,
      link.channel,
      link.clientRef,
    ],
  );

  // `on conflict ... do update` always returns a row — the inserted one, or the
  // one it collided with. Nothing coming back would mean the conflict target no
  // longer matches the index, which is a migration bug rather than a runtime
  // condition, so it says so instead of returning a half-made link.
  const row = rows[0];
  if (!row) throw new Error('share link insert returned no row — check share_links_client_ref_idx');
  return row;
}

export async function getShareLink(code: string): Promise<ShareLinkRow | null> {
  const rows = await query<ShareLinkRow>(`select ${COLUMNS} from share_links where code = $1`, [code]);
  return rows[0] ?? null;
}

/**
 * Somebody followed the link.
 *
 * One statement, returning the row, so the landing page's render and its counter
 * are a single round trip. A code that does not exist updates nothing and
 * returns null, which is how a mistyped or forged link is told apart from a real
 * one without a second select.
 */
export async function recordOpen(code: string): Promise<ShareLinkRow | null> {
  const rows = await query<ShareLinkRow>(
    `update share_links set opens = opens + 1, last_opened_at = now()
     where code = $1
     returning ${COLUMNS}`,
    [code],
  );
  return rows[0] ?? null;
}

/** The share channel, chosen after the link was minted. */
export async function setShareChannel(code: string, channel: string): Promise<void> {
  await query('update share_links set channel = $2 where code = $1', [code, channel]);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * The events the funnel is made of.
 *
 * A closed set rather than free text, because an analytics table whose `name`
 * column is whatever the client felt like sending is a table nobody can group by
 * six months later. Anything outside this list is dropped at the route and
 * counted, not stored and not an error — a client one version ahead of the
 * server must not fail to share because it learned a new event name.
 */
export const SHARE_EVENTS = [
  /** The share sheet was opened on a finished look. */
  'share_opened',
  /** A platform was chosen — instagram, whatsapp, facebook, system. */
  'share_channel_selected',
  /** The image and caption were handed to the OS. */
  'share_initiated',
  /** The OS reported the share went somewhere. iOS also tells us where. */
  'share_completed',
  /** The user backed out of the system sheet. */
  'share_dismissed',
  /** Something in the flow failed — card capture, link mint, the sheet itself. */
  'share_failed',
  /** A shared link was followed. Recorded by the landing page and by the app. */
  'share_link_opened',
  /** A device arrived on a link it had never been attributed to before. */
  'share_install_attributed',
  /** That device later became an account. Nothing writes this yet. */
  'share_signup_attributed',
] as const;

export type ShareEventName = (typeof SHARE_EVENTS)[number];

export const isShareEvent = (value: unknown): value is ShareEventName =>
  SHARE_EVENTS.includes(value as ShareEventName);

export interface ShareEvent {
  name: ShareEventName;
  code?: string | null;
  deviceId?: string | null;
  channel?: string | null;
  platform?: string | null;
  props?: Record<string, unknown> | null;
}

/**
 * Appends events.
 *
 * One multi-row insert rather than a loop, because the app batches: a single
 * share is four events in about eight seconds, and four requests up a phone's
 * uplink to record them would cost more than the feature does.
 */
export async function recordEvents(events: ShareEvent[]): Promise<number> {
  if (!events.length) return 0;

  const values: unknown[] = [];
  const tuples = events.map((event, index) => {
    const at = index * 6;
    values.push(
      event.name,
      event.code ?? null,
      event.deviceId ?? null,
      event.channel ?? null,
      event.platform ?? null,
      event.props ? JSON.stringify(event.props) : null,
    );
    return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6})`;
  });

  await query(
    `insert into share_events (name, code, device_id, channel, platform, props) values ${tuples.join(', ')}`,
    values,
  );
  return events.length;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export type AttributionSource = 'deep_link' | 'referrer';

export interface Attribution {
  code: string;
  source: AttributionSource;
  /** True only for the write that actually created the row. */
  first: boolean;
}

/**
 * Ties a device to the share that brought it in, once and for all.
 *
 * `do nothing` rather than `do update`: the first link a device ever arrives on
 * is the one that earned it, and a user who later opens a friend's link must not
 * move the credit. The empty return on a conflict is the whole signal — it is
 * how the caller knows whether an install has just been counted.
 *
 * A sharer opening their own link is refused outright. Counting it would make
 * the funnel a measure of curiosity rather than of reach, and it is the single
 * easiest number in here to inflate by accident while testing.
 */
export async function attribute(
  deviceId: string,
  code: string,
  source: AttributionSource,
): Promise<Attribution | null> {
  const link = await getShareLink(code);
  if (!link) return null;
  if (link.device_id === deviceId) return null;

  // `insert ... select ... where not exists` rather than `on conflict do
  // nothing`, and the difference is the *returning* clause: an insert that
  // conflicts and an insert whose select produced no rows both write nothing,
  // but only the second is guaranteed by the standard to return nothing. That
  // guarantee is the entire signal here — it is how an install is told from a
  // revisit — so it is not left to a dialect's reading of `do nothing`. The
  // conflict clause stays as the race guard: two arrivals in the same
  // millisecond both pass the `not exists` and one of them must lose quietly
  // rather than throwing on the primary key.
  const rows = await query<{ code: string; source: AttributionSource }>(
    `insert into share_attributions (device_id, code, source)
     select $1, $2, $3
     where not exists (select 1 from share_attributions where device_id = $1)
     on conflict (device_id) do nothing
     returning code, source`,
    [deviceId, code, source],
  );

  if (!rows[0]) return attributionFor(deviceId);

  await query('update share_links set installs = installs + 1 where code = $1', [code]);
  return { code, source, first: true };
}

/**
 * The device became an account.
 *
 * Nothing calls this yet — there are no accounts — and it is here rather than
 * absent because it is one statement, and because the alternative is a funnel
 * that stops at install plus a schema change on the day signup exists.
 * Idempotent: a device signs up once, so a second call must not count a second.
 */
export async function attributeSignup(deviceId: string): Promise<Attribution | null> {
  const rows = await query<{ code: string; source: AttributionSource }>(
    `update share_attributions set signup_at = now()
     where device_id = $1 and signup_at is null
     returning code, source`,
    [deviceId],
  );
  const row = rows[0];
  if (!row) return null;
  await query('update share_links set signups = signups + 1 where code = $1', [row.code]);
  return { ...row, first: true };
}

export async function attributionFor(deviceId: string): Promise<Attribution | null> {
  const rows = await query<{ code: string; source: AttributionSource }>(
    'select code, source from share_attributions where device_id = $1',
    [deviceId],
  );
  return rows[0] ? { ...rows[0], first: false } : null;
}
