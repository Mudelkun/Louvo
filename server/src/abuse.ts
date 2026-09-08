/**
 * The anonymous ceiling: how much one network-and-device-class may generate
 * without an account, however many identities it presents.
 *
 * ## The problem this does not solve, stated first
 *
 * A browser's device secret lives in `localStorage`. Clearing it mints a new
 * secret, which hashes to a new device, which is owed its own free allowance —
 * and there is no way to recognise that browser again. `localStorage`, cookies
 * and IndexedDB are all cleared by the same menu item and all absent in the same
 * private window, so moving the secret between them buys nothing at all. The
 * only thing that survives is a fingerprint, and `anchors.ts` refuses to build
 * one: both stores forbid it, and being probabilistic it denies free generations
 * to people who never had any.
 *
 * So this module does not try to identify anybody. The free allowance stays
 * exactly where it was, on the anchor the client presents. What is added is a
 * **ceiling**: a cap on anonymous generations per network-and-device-class per
 * window, which makes clearing storage pointless without making anyone
 * identifiable. Somebody determined still gets the cap; they just stop getting
 * an unbounded number of them, and the loss is bounded by a number we chose.
 *
 * ## Why this is a rate limit and not the fingerprinting the codebase refuses
 *
 * The distinction is not a matter of degree, and three properties hold it:
 *
 * - **The inputs are deliberately low-entropy.** The client IP, a *coarse*
 *   user-agent class — browser family, OS family, major versions, never the raw
 *   string — and the accepted language. That is enough to tell an iPhone from a
 *   MacBook from an Android behind one router, which is the case that matters
 *   because a household shares one address. It is nowhere near enough to
 *   recognise a person, and nothing stored here could be compared against
 *   anything outside this table.
 * - **It is never read for a signed-in device.** Once there is an account, the
 *   account is the identity. Signed-in and paying users are not rate limited by
 *   this at all, which is what makes the shared-wifi false positive survivable.
 * - **Exhausting it asks for a sign-in rather than refusing.** The caller turns
 *   a spent bucket into `anon_limit_reached`, which the interface answers with
 *   "sign in to keep going — it is free", not with a paywall. A false positive
 *   therefore costs somebody a free sign-in, never their first preview. That is
 *   the property that lets the cap be set low enough to be worth having.
 *
 * The id is a salted hash for the reason `anchorIdFor` is: what a ceiling needs
 * from its key is equality, and a hash has that. `ANCHOR_SALT` is reused, so
 * rotating it resets the ceilings along with the allowances — which is already
 * documented as a thing not to do casually.
 *
 * ## The window
 *
 * Fixed rather than sliding, and rolled over by the same call that reads it, so
 * there is no sweeper and no cron. A sliding window needs a row per event and a
 * periodic delete to stay finite; a fixed one is a counter and a timestamp, and
 * the difference between them matters to nobody being rate limited once a day.
 */

import { createHash } from 'node:crypto';

import { query, type Queryer } from './db.js';
import { env } from './env.js';
import { sendMail } from './mail.js';

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

/**
 * The network part.
 *
 * IPv4 is used whole: a household is one address, which is exactly the grain
 * wanted. IPv6 is truncated to its /64, because a single machine is routinely
 * handed a whole range and rotates through it — treating each address as its own
 * bucket would make the ceiling free to defeat by reloading. A /64 is the
 * smallest block that is reliably one network rather than one interface.
 *
 * `trustProxy` is on in `index.ts`, so `request.ip` is the client rather than
 * Railway's edge. Without it this module would bucket the entire internet
 * together, and the failure would be silent: one bucket, everybody rate limited,
 * no error anywhere.
 */
export function networkKey(ip: string): string {
  const clean = ip.trim().toLowerCase().replace(/^::ffff:/, '');
  if (!clean.includes(':')) return clean;
  // Expanding an abbreviated address properly is not worth it here: the first
  // four groups of the textual form are the /64 whenever they are present, and
  // an address abbreviated inside them is one whose omitted groups are zeroes.
  return clean.split(':').slice(0, 4).join(':');
}

const BROWSERS: [RegExp, string][] = [
  [/edg(?:e|a|ios)?\/(\d+)/, 'edge'],
  [/opr\/(\d+)|opera\/(\d+)/, 'opera'],
  [/samsungbrowser\/(\d+)/, 'samsung'],
  [/firefox\/(\d+)|fxios\/(\d+)/, 'firefox'],
  [/crios\/(\d+)/, 'chrome'],
  [/chrome\/(\d+)/, 'chrome'],
  // Safari reports its version and its engine at opposite ends of the string,
  // with `Mobile/15E148` between them on iOS. Anchored on `safari/` so a UA that
  // merely mentions Safari for compatibility does not match on its own.
  [/version\/(\d+)[.\d]*.*safari\//, 'safari'],
];

const PLATFORMS: [RegExp, string][] = [
  [/iphone os (\d+)|ipad; cpu os (\d+)|cpu os (\d+)/, 'ios'],
  [/android (\d+)/, 'android'],
  [/mac os x (\d+)/, 'macos'],
  [/windows nt (\d+)/, 'windows'],
  [/cros/, 'chromeos'],
  [/linux/, 'linux'],
];

/**
 * The device-class part: two families and two major versions, and nothing else.
 *
 * This is the piece that keeps a household from sharing one ceiling. Four people
 * on one router are, in practice, an iPhone, a Windows laptop, a MacBook and an
 * Android — four classes, four buckets, four independent allowances. Two people
 * on the *same* model and OS version do collide, and that is the accepted false
 * positive: it costs them a sign-in, which is free.
 *
 * The raw user-agent string is never stored and never hashed. It carries a build
 * number, a device model and sometimes a carrier, which together are most of a
 * fingerprint; a family and a major version are neither rare nor durable.
 */
export function deviceClass(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').toLowerCase().slice(0, 400);
  const pick = (table: [RegExp, string][]): string => {
    for (const [pattern, name] of table) {
      const match = pattern.exec(ua);
      if (match) {
        const version = match.slice(1).find(Boolean);
        return version ? `${name}${version}` : name;
      }
    }
    return 'other';
  };
  return `${pick(BROWSERS)}/${pick(PLATFORMS)}`;
}

/** The primary language, without the quality values or the fallback list. */
export function languageKey(header: string | undefined): string {
  return (header ?? '').toLowerCase().split(',')[0]?.split(';')[0]?.trim().slice(0, 12) || 'none';
}

export interface RequestSignals {
  ip: string;
  userAgent: string | undefined;
  language: string | undefined;
}

/** The bucket a request belongs to. Salted, so it is not recomputable elsewhere. */
export function bucketIdFor({ ip, userAgent, language }: RequestSignals): string {
  const key = `${networkKey(ip)}|${deviceClass(userAgent)}|${languageKey(language)}`;
  return createHash('sha256').update(`anon:${key}:${env.anchorSalt}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

export interface AnonDecision {
  allowed: boolean;
  /** Anonymous generations left in this bucket's window, after this claim. */
  remaining: number;
  /** Distinct device secrets this bucket has presented in the window. */
  devices: number;
  bucketId: string;
}

/**
 * Takes one anonymous generation against this bucket, or refuses.
 *
 * The refusal is the caller's to interpret, and it must not be turned into
 * `insufficient_credits`: nothing about this says the user is out of credits,
 * only that this network has had its anonymous share for now. See
 * `anon_limit_reached` in `previews.ts`.
 *
 * The claim is a compare-and-set — `set generations = generations + 1 where
 * generations < $cap` — for the reason every other guard in this service is one:
 * a check followed by an update is a race, and two submissions arriving together
 * would both pass a cap of one. Zero rows back means the cap was already
 * reached, whatever the timing.
 */
export async function claimAnonymous(
  signals: RequestSignals,
  deviceId: string,
  db: Queryer = query,
): Promise<AnonDecision> {
  const bucketId = bucketIdFor(signals);
  const windowStart = new Date(Date.now() - env.anon.windowSeconds * 1000);

  await db(
    `insert into anon_buckets (id) values ($1)
     on conflict (id) do update set last_seen_at = now()`,
    [bucketId],
  );

  // Roll the window over if it has expired. Reset rather than delete, so
  // `first_seen_at` survives and an alert can say how long this bucket has been
  // around — a bucket first seen four weeks ago behaving oddly today is a very
  // different thing from one that appeared an hour ago.
  await db(
    `update anon_buckets set window_start = now(), generations = 0, alerted_at = null
      where id = $1 and window_start < $2`,
    [bucketId, windowStart],
  );
  await db(`delete from anon_bucket_devices where bucket_id = $1 and created_at < $2`, [bucketId, windowStart]);

  // Recorded before the claim, and recorded even when the claim fails. The
  // device count is the abuse *signal*, and the requests worth noticing are
  // precisely the ones being refused — a loop clearing storage presents its
  // ninth device and is turned away, and that is the moment there is something
  // to say about it.
  await db(
    `insert into anon_bucket_devices (bucket_id, device_id) values ($1, $2)
     on conflict (bucket_id, device_id) do nothing`,
    [bucketId, deviceId],
  );

  const claimed = await db<{ generations: number }>(
    `update anon_buckets set generations = generations + 1, last_seen_at = now()
      where id = $1 and generations < $2
      returning generations`,
    [bucketId, env.anon.maxPerBucket],
  );

  const devices = await countDevices(bucketId, db);
  const used = claimed[0]?.generations ?? env.anon.maxPerBucket;

  return {
    allowed: claimed.length > 0,
    remaining: Math.max(0, env.anon.maxPerBucket - used),
    devices,
    bucketId,
  };
}

/**
 * Gives back a claim that did not become a generation.
 *
 * Called when the job is cancelled between the claim and the charge — the same
 * lost-race path that releases a credit. Floored at zero rather than allowed to
 * go negative, because a release with no matching claim is a bug that should not
 * also hand out free generations.
 */
export async function releaseAnonymous(bucketId: string, db: Queryer = query): Promise<void> {
  await db(
    `update anon_buckets set generations = generations - 1
      where id = $1 and generations > 0`,
    [bucketId],
  );
}

/**
 * Distinct device secrets seen in the current window.
 *
 * `count(*)` over the primary key rather than a maintained counter, and that is
 * a correctness decision: incrementing on a newly-inserted device would mean
 * reading whether `on conflict do nothing` affected a row, and `pg-mem` returns
 * the conflicting row from `returning` where Postgres returns none. A counter
 * built on that would be right in production and wrong under test, which is the
 * worse of the two available bugs.
 */
async function countDevices(bucketId: string, db: Queryer = query): Promise<number> {
  const rows = await db<{ n: number }>(
    `select count(*)::int as n from anon_bucket_devices d
       join anon_buckets b on b.id = d.bucket_id
      where d.bucket_id = $1 and d.created_at >= b.window_start`,
    [bucketId],
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// The alert
// ---------------------------------------------------------------------------

/**
 * Emails once when a bucket looks like a loop rather than a household.
 *
 * The trigger is **distinct devices**, not generations. Generations are already
 * capped, so a bucket at its cap is the system working; what the cap cannot say
 * is whether it was reached by three flatmates or by one person clearing storage
 * nine times. The device count is the only thing that separates those, which is
 * why it is the thing that is watched.
 *
 * `alerted_at` is moved by compare-and-set, so the email is sent once per bucket
 * per window by whichever request got there first — two racing requests do not
 * produce two emails, and a busy office is reported once rather than every few
 * minutes.
 *
 * Failure here is deliberately invisible to the caller. This runs on the path of
 * somebody trying to generate a preview, and an alerting system that can fail
 * their request is worse than no alerting system.
 */
export async function reportIfSuspicious(decision: AnonDecision, db: Queryer = query): Promise<boolean> {
  const to = env.anon.alertEmail;
  if (!to || decision.devices < env.anon.alertDevices) return false;

  const claimed = await db<{ generations: number; first_seen_at: Date; window_start: Date }>(
    `update anon_buckets set alerted_at = now()
      where id = $1 and alerted_at is null
      returning generations, first_seen_at, window_start`,
    [decision.bucketId],
  );
  const row = claimed[0];
  if (!row) return false;

  const hours = Math.round(env.anon.windowSeconds / 360) / 10;
  return sendMail({
    to,
    subject: `Luvo: ${decision.devices} anonymous devices from one bucket`,
    text: [
      `One rate-limit bucket has presented ${decision.devices} distinct device secrets`,
      `in the last ${hours}h, against an alert threshold of ${env.anon.alertDevices}.`,
      '',
      `Bucket:             ${decision.bucketId.slice(0, 16)}...`,
      `Anonymous previews: ${row.generations} of ${env.anon.maxPerBucket} allowed this window`,
      `Window opened:      ${new Date(row.window_start).toISOString()}`,
      `Bucket first seen:  ${new Date(row.first_seen_at).toISOString()}`,
      '',
      'A bucket is one client IP plus a coarse browser/OS class, so several people',
      'in one house normally land in different buckets. Many devices in one bucket',
      'usually means one browser clearing its storage repeatedly.',
      '',
      'Nothing is broken and nothing needs doing: the ceiling has already refused',
      'the extra generations, and those requests were asked to sign in instead.',
      'This is a note that it happened, not an incident.',
      '',
      'No IP address, user-agent or other identifier is stored anywhere — the',
      'bucket id is a salted hash and cannot be reversed to any of them.',
    ].join('\n'),
  });
}
