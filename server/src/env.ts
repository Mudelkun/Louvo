/**
 * Configuration, read once and validated loudly.
 *
 * A server that boots with a missing `DATABASE_URL` and fails on the first
 * request is a server whose deploy looked green. Everything required is checked
 * here, at startup, so Railway's health check is the thing that goes red.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see server/.env.example`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

/**
 * The transient bucket, or null when nothing is configured.
 *
 * Null is a supported state rather than a failure: the catalog API is the older
 * and more important of the two services, and a checkout with no R2 credentials
 * must still boot and serve `/v1/catalog`. What it must not do is pretend it can
 * generate previews — `/v1/previews` answers 503 `previews_unconfigured` in that
 * case, which the app reads and falls back from exactly as it falls back to the
 * bundled catalog.
 *
 * It is deliberately a *different bucket* from the catalog's. The catalog bucket
 * is public, CDN-fronted and cached `immutable` for a year, which is precisely
 * the set of properties a photograph of somebody's face must never have. This
 * one has no public domain bound to it at all: the only way to read an object in
 * it is a signed url this process mints, and those last minutes.
 */
function previewStorage() {
  const bucket = optional('PREVIEW_BUCKET');
  const accessKeyId = optional('R2_ACCESS_KEY_ID');
  const secretAccessKey = optional('R2_SECRET_ACCESS_KEY');
  const accountId = optional('R2_ACCOUNT_ID');
  const endpoint = optional('R2_ENDPOINT') ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return { bucket, accessKeyId, secretAccessKey, endpoint, region: process.env.R2_REGION ?? 'auto' };
}

const previews = {
  storage: previewStorage(),

  /** The generator key. Server-side only — this is the whole point of phase 2. */
  falKey: optional('FAL_KEY'),

  /**
   * The try-on model and its options, mirrored from `src/api/tryOn.ts`.
   *
   * Named `TRY_ON_*` rather than `FAL_EDIT_MODEL` for the reason recorded there:
   * one switch moving both the preview model and the catalog generators would
   * re-point a generator whose model change means re-shooting 103 renders.
   */
  model: process.env.TRY_ON_MODEL ?? 'openai/gpt-image-2/edit',
  quality: process.env.TRY_ON_QUALITY ?? 'medium',
  resolution: process.env.TRY_ON_RESOLUTION ?? '2K',
  imageSize: process.env.TRY_ON_IMAGE_SIZE ?? 'match',

  /**
   * How many generations may be in flight at fal at once.
   *
   * This is not a guess and not a safety margin — it is the account's actual
   * concurrency limit, which fal sets from credits purchased in the last four
   * weeks (10 at $10, 40 at $1000+). Submitting past it does not buy throughput;
   * it buys rejections. Everything else queues behind this number, which is why
   * a burst is a wait rather than a failure.
   */
  maxInflight: integer('FAL_MAX_INFLIGHT', 10),

  /**
   * How many of those slots one device may hold.
   *
   * With ten slots in total, one user pressing Generate five times would own
   * half the queue and every other user would wait behind them. One is the right
   * number until the limit is much larger.
   */
  maxInflightPerDevice: integer('FAL_MAX_INFLIGHT_PER_DEVICE', 1),

  /** How long the client has to PUT its photo before the job is abandoned. */
  uploadTtlSeconds: integer('PREVIEW_UPLOAD_TTL_S', 900),
  /** How long a result download url stays valid. Minutes, not hours. */
  downloadTtlSeconds: integer('PREVIEW_DOWNLOAD_TTL_S', 900),

  /**
   * The hand-off window, in days.
   *
   * A preview lives on the device that generated it, permanently, until its
   * owner deletes it — that is the answer to "how long is it available". This
   * number is something else entirely: how long our *copy* waits to be collected
   * before it is deleted unread. It is a backstop for a phone that was off, not
   * a retention policy, and the sweeper deletes on it whether or not anyone came.
   */
  retentionDays: integer('PREVIEW_RETENTION_DAYS', 7),

  /** Refused above this, before a signature is minted. */
  maxUploadBytes: integer('PREVIEW_MAX_UPLOAD_BYTES', 12 * 1024 * 1024),

  /** How often the worker looks for something to do. */
  pollMs: integer('WORKER_POLL_MS', 2000),

  /** Expo's push service. Nothing here talks to APNs or FCM directly. */
  expoPushUrl: process.env.EXPO_PUSH_URL ?? 'https://exp.host/--/api/v2/push/send',
} as const;

/**
 * Sharing: where a shared link lives, and where it sends someone who follows it.
 *
 * All of it is optional and all of it degrades to something honest. With no
 * `SHARE_BASE_URL` the landing page is served from this deployment's own origin,
 * which is correct for a Railway URL and merely ugly for a marketing one. With
 * no store urls the landing page offers the app's deep link and says the store
 * listings are not live yet, rather than linking somewhere that 404s — a broken
 * download button is a worse advertisement than an absent one.
 *
 * `appScheme` has to agree with `expo.scheme` in app.json. It is the one value
 * here that is not cosmetic: it is what makes a link open the app somebody
 * already has rather than a web page telling them to install it.
 */
const share = {
  /** Public origin serving `/s/:code`. Falls back to the request's own origin. */
  baseUrl: (optional('SHARE_BASE_URL') ?? '').replace(/\/$/, '') || null,
  appScheme: process.env.APP_SCHEME ?? 'hairify',
  iosAppStoreUrl: optional('IOS_APP_STORE_URL'),
  androidPlayUrl: optional('ANDROID_PLAY_URL'),
  /** Android package id, used to build a Play url and its `referrer` parameter. */
  androidPackage: process.env.ANDROID_PACKAGE ?? 'com.hairify.app',
  iosBundleId: process.env.IOS_BUNDLE_ID ?? 'com.hairify.app',
  /** Numeric App Store id, for the iOS smart app banner. */
  iosAppId: optional('IOS_APP_ID'),
  /** Team id and signing fingerprints, for the universal-link association files. */
  iosTeamId: optional('IOS_TEAM_ID'),
  androidFingerprints: (optional('ANDROID_SHA256_FINGERPRINTS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
} as const;

function list(name: string): string[] {
  return (optional(name) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function flag(name: string, fallback: boolean): boolean {
  const raw = optional(name);
  if (raw === null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

/**
 * The credit system.
 *
 * `enforced` defaults to **on**, and that is the one value here worth a second
 * look before deploying. With it on, a device gets `freeGenerations` previews
 * and then needs an account and a purchase; with it off, generation behaves
 * exactly as it did before credits existed. Off is for a local checkout, where
 * two free generations is not enough to iterate on a prompt. It is not a
 * production setting, and a deployment that turns it off is giving previews away
 * at about five cents each.
 */
const credits = {
  enforced: flag('CREDITS_ENFORCED', true),
  freeGenerations: integer('FREE_GENERATIONS', 2),
} as const;

/**
 * Sign-in, and the RevenueCat webhook that pays for it.
 *
 * All of it is optional and every piece degrades to a refusal rather than to a
 * guess. A deployment with no Apple audience answers `apple_unconfigured` to an
 * Apple sign-in instead of accepting a token it cannot verify — which is the
 * only safe direction for an auth configuration to fail in.
 *
 * `appleAudiences` is the app's bundle id (and the Services ID, if web sign-in
 * is ever added). `googleAudiences` is every OAuth client id that can mint a
 * token for this app — iOS, Android and Web are three different ids and the
 * token's `aud` is whichever one the phone used, so all of them belong here.
 */
const auth = {
  appleAudiences: list('APPLE_AUDIENCES').length ? list('APPLE_AUDIENCES') : [process.env.IOS_BUNDLE_ID ?? 'com.hairify.app'],
  googleAudiences: list('GOOGLE_CLIENT_IDS'),

  emailCodeTtlSeconds: integer('EMAIL_CODE_TTL_S', 600),
  emailCodeAttempts: integer('EMAIL_CODE_ATTEMPTS', 5),
  /** Resend, or nothing. With nothing, email sign-in answers 503 rather than pretending. */
  resendApiKey: optional('RESEND_API_KEY'),
  emailFrom: process.env.EMAIL_FROM ?? 'Hairify <hello@hairify.app>',
  /**
   * Returns the code in the API response instead of sending it.
   *
   * A local-development affordance and a genuine hole: anyone who can call the
   * endpoint can sign in as any address. Explicitly opt-in, never defaulted on,
   * and refused outright when a mail provider is configured — because the only
   * deployment that has both is one that meant to turn this off.
   */
  emailDevEcho: flag('EMAIL_DEV_ECHO', false) && !optional('RESEND_API_KEY'),

  /**
   * The shared secret on RevenueCat's webhook.
   *
   * Set the same value in the RevenueCat dashboard's Authorization header field.
   * Without it the webhook refuses every delivery — an open endpoint that grants
   * credits is an endpoint that grants credits to whoever finds it.
   */
  revenueCatSecret: optional('REVENUECAT_WEBHOOK_SECRET'),
} as const;

export const env = {
  /** Railway injects this. */
  databaseUrl: required('DATABASE_URL'),

  /**
   * The salt under which install anchors and email codes are hashed.
   *
   * Not a secret whose leak is catastrophic — an `ANDROID_ID` is 64 bits, so the
   * hash is not brute-forceable either way — but it is what stops a stored
   * anchor being a value anybody else can recompute from a device identifier
   * they already have.
   *
   * **Rotating it resets every free allowance**, because every anchor hashes to
   * a new id and a new id has never been seen before. That is a thing to know
   * before changing it, not a thing to discover afterwards.
   */
  anchorSalt: process.env.ANCHOR_SALT ?? 'hairify.anchor.v1',

  credits,
  auth,

  /** Railway injects `PORT`; the default is only for a local run. */
  port: integer('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',

  logLevel: process.env.LOG_LEVEL ?? 'info',

  /**
   * How long a built catalog may be reused without checking the revision.
   *
   * The catalog changes only when someone runs a publish, so this is the
   * staleness a publisher is willing to wait through, not a correctness knob.
   * Zero means check the revision on every request, which is one cheap query.
   */
  catalogCacheMs: integer('CATALOG_CACHE_MS', 30_000),

  /**
   * Allowed browser origins. Native clients do not send `Origin` and are
   * unaffected; this is for `npm run web` and for any future admin UI.
   * `*` is the default because the catalog is public, read-only data.
   */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  /**
   * `require` unless told otherwise: Railway's internal Postgres URL is not TLS,
   * its public one is, and neither presents a certificate this process has a
   * root for.
   */
  databaseSsl: (process.env.DATABASE_SSL ?? 'auto') as 'auto' | 'off' | 'on',

  /**
   * Everything the preview pipeline needs, and nothing the catalog API does.
   *
   * Grouped rather than flattened because the two halves of this deployment have
   * genuinely different requirements: the API boots with `DATABASE_URL` alone,
   * and the worker refuses to start without a bucket and a generator key. A
   * glance at `env.previews.storage === null` is the whole question "can this
   * process generate anything".
   */
  previews,

  /**
   * Sharing and referral. Never null: a deployment with none of it configured
   * still mints links and still serves a landing page, it just has nowhere to
   * send an install.
   */
  share,
} as const;
