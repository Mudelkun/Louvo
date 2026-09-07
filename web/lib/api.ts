/**
 * The one module that knows where the data comes from.
 *
 * The web's counterpart to `src/api/client.ts`, and it keeps that file's two
 * load-bearing habits:
 *
 * - **Every outcome is reported, never disguised.** `fetchCatalog` says whether
 *   it got the API or a cached copy, exactly as `catalogSource()` does on the
 *   phone, and the footer prints it. A user looking at a stale catalog deserves
 *   to know.
 * - **Nothing is invented.** A failed generation is a failure with a reason.
 *   There is no simulation path here at all — the app has one because a fresh
 *   checkout must run with no server, and a website with no server is a website
 *   that is down.
 *
 * ## The shapes
 *
 * `CatalogResponse` is generated from the server's own types
 * (`lib/contract/catalog.ts`). Everything below — the preview job, the credit
 * state — is a hand-written mirror of `server/src/previews.ts` and
 * `server/src/credits.ts`, for the same reason the app mirrors them: they are
 * small, they are read in one place, and a generated copy of a route's return
 * type would mean generating the route.
 */

import { API_URL, REQUEST_TIMEOUT_MS, hasApi } from './config';
import type {
  CatalogResponse,
  Gender,
  HairLengthId,
  HairTypeId,
} from './contract/catalog';
import { deviceHeader, deviceSecret } from './device';

export type { CatalogResponse };

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

/**
 * A refusal the interface can act on, rather than a string to print.
 *
 * `code` is the server's own `error` field, so `insufficient_credits` opens the
 * paywall and `previews_unconfigured` says the generator is not configured on
 * this deployment — two very different things that a message alone cannot
 * distinguish.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: Record<string, unknown>;

  constructor(status: number, code: string, message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }

  /** No network, no DNS, a CORS preflight refused — anything with no status. */
  static offline(message = 'the Luvo service could not be reached'): ApiError {
    return new ApiError(0, 'offline', message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'no_api', 'this build has no NEXT_PUBLIC_API_URL');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...deviceHeader(),
        ...init.headers,
      },
    });
  } catch (error) {
    // A browser reports a refused preflight and a dead host identically, as a
    // bare TypeError with no status and no body. Both are "not reachable from
    // here", which is the only thing the interface can honestly say.
    throw ApiError.offline(error instanceof Error && error.name === 'AbortError' ? 'the request timed out' : undefined);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const body = text ? safeJson(text) : {};

  if (!response.ok) {
    const record = body as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof record.error === 'string' ? record.error : 'request_failed',
      typeof record.message === 'string' ? record.message : `${response.status} ${response.statusText}`,
      record,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/**
 * Where the catalog on screen came from.
 *
 * Three outcomes rather than two, mirroring `CatalogSource` in the app:
 * `api` fetched it, `cache` is this browser's own copy after the network
 * failed, and `none` is a build with no API url — where the app would fall back
 * to a bundled catalog and this cannot, because there is nothing bundled.
 */
export type CatalogSource = 'api' | 'cache' | 'none';

export interface CatalogResult {
  catalog: CatalogResponse;
  source: CatalogSource;
}

const CATALOG_CACHE_KEY = 'luvo.catalog.v1';

/**
 * The catalog, with a `localStorage` copy behind it.
 *
 * The cache is not an optimisation — the API already serves this document
 * gzipped with an ETag and a 60-second `Cache-Control`, and the browser's own
 * HTTP cache does that job better than any code here could. It is a *fallback*,
 * for the one case the HTTP cache does not cover: the API being unreachable
 * while somebody is halfway through choosing a haircut. A shopfront that goes
 * blank on a dropped connection is a shopfront that lost the sale.
 *
 * It is written on every successful fetch and read only on failure, so a stale
 * copy can never win against a live one.
 */
export async function fetchCatalog(): Promise<CatalogResult> {
  if (!hasApi) throw new ApiError(0, 'no_api', 'this build has no NEXT_PUBLIC_API_URL');

  try {
    const catalog = await call<CatalogResponse>('/v1/catalog');
    writeCache(catalog);
    return { catalog, source: 'api' };
  } catch (error) {
    const cached = readCache();
    if (cached) return { catalog: cached, source: 'cache' };
    throw error;
  }
}

function writeCache(catalog: CatalogResponse): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // A full or blocked storage is not a reason to fail a catalog that arrived.
  }
}

function readCache(): CatalogResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogResponse;
    // Shape-checked rather than trusted: a cache written by an older build with
    // a different manifest nesting would render as a catalog with no imagery,
    // which looks exactly like a catalog that has not been generated yet.
    return Array.isArray(parsed?.hairstyles) && parsed.renders ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Credits and the account
// ---------------------------------------------------------------------------

/** Mirrors `CreditState` in `server/src/credits.ts`. */
export interface CreditState {
  free: number;
  credits: number;
  total: number;
  freeGranted: number;
  signedIn: boolean;
}

export interface AccountSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: number;
  providers: string[];
}

export interface AccountState {
  account: AccountSummary | null;
  credits: CreditState;
  /** What the app must send the store as its purchaser id. Null until signed in. */
  purchaserId: string | null;
}

/**
 * A credit pack, as `credit_products` holds it.
 *
 * **There is no price column and the API never sends one.** The store quotes the
 * price, localised, and a second copy of it in our database is a number that
 * eventually disagrees with the till — the argument is in the credits section of
 * CLAUDE.md, written about StoreKit and Play, and it transfers to Stripe
 * unchanged: the Price object is the authority, this row says only how many
 * generations the pack is worth.
 */
export interface CreditProduct {
  id: string;
  credits: number;
  /** "Best value" and the like, set per row so it is not hardcoded per client. */
  badge: string | null;
}

export const fetchAccount = (): Promise<AccountState> => call<AccountState>('/v1/account');

export const fetchCredits = (): Promise<{ credits: CreditState; products: CreditProduct[] }> =>
  call<{ credits: CreditState; products: CreditProduct[] }>('/v1/credits');

export interface CreditHistoryEntry {
  kind: string;
  source: string | null;
  delta: number;
  reason: string | null;
  at: number;
}

export const fetchCreditHistory = (): Promise<{ history: CreditHistoryEntry[] }> =>
  call<{ history: CreditHistoryEntry[] }>('/v1/credits/history');

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

/** Mirrors `PreviewStage` in `server/src/previews.ts`. */
export type PreviewStage = 'prepare' | 'apply' | 'finalize';

export type PreviewStatus =
  | 'awaiting_upload'
  | 'queued'
  | 'running'
  | 'ready'
  | 'collected'
  | 'failed'
  | 'cancelled';

export interface PreviewJob {
  id: string;
  status: PreviewStatus;
  stage: PreviewStage;
  hairstyleId: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId: HairLengthId | null;
  variant: string | null;
  views: string[];
  createdAt: number;
  chargeSource?: 'free' | 'paid';
  queuePosition?: number;
  error?: string;
  errorCode?: string;
  result?: { url: string; width: number | null; height: number | null; expiresAt: number };
}

interface SubmitResponse {
  job: PreviewJob;
  credits: CreditState;
  upload: { method: string; url: string; expiresIn: number; maxBytes: number } | null;
}

export const TERMINAL: PreviewStatus[] = ['ready', 'collected', 'failed', 'cancelled'];

export const isTerminal = (job: Pick<PreviewJob, 'status'>): boolean => TERMINAL.includes(job.status);

export interface SubmitRequest {
  hairstyleId: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId?: HairLengthId | null;
  /** The prepared photograph, already downscaled and re-encoded. */
  photo: Blob;
  photoWidth: number;
  photoHeight: number;
  /** Survives a retried POST without becoming a second generation — and a
   * second generation is a second five cents. */
  idempotencyKey: string;
  /**
   * The server's id for this job as soon as it exists, before the photograph has
   * been uploaded rather than after the whole sequence returns.
   *
   * This is what makes cancelling work during the slowest part of the flow. The
   * row is created by the first of three calls; a caller that learned the id
   * only at the end had nothing to cancel while the upload was in flight, and
   * would leave a real job on the server that nobody was watching.
   */
  onCreated?: (id: string) => void;
}

/**
 * Creates the job, uploads the photograph, and releases it to the queue.
 *
 * Three calls rather than one multipart POST, and the split is what keeps image
 * bytes off the API entirely: the middle one goes straight to the bucket on a
 * url the API signed. It also means the flaky, expensive half can be retried on
 * its own — the job already exists and re-uploading to the same signed url costs
 * nothing.
 *
 * **The upload is the one request here that leaves our origin**, so it is the
 * one that needs CORS on the bucket. A bucket with no policy answers the
 * preflight `403 CORS not configured`, which a browser reports to JavaScript as
 * a bare `TypeError` with no status — and the job then sits in `awaiting_upload`
 * looking exactly like a slow queue. `server/scripts/preview-cors.mjs` is what
 * sets it, and this origin has to be in that list.
 */
export async function submitPreview(request: SubmitRequest): Promise<PreviewJob> {
  const submitted = await call<SubmitResponse>('/v1/previews', {
    method: 'POST',
    body: JSON.stringify({
      hairstyleId: request.hairstyleId,
      gender: request.gender,
      hairType: request.hairType,
      lengthId: request.lengthId ?? null,
      photoWidth: request.photoWidth,
      photoHeight: request.photoHeight,
      idempotencyKey: request.idempotencyKey,
    }),
  });

  request.onCreated?.(submitted.job.id);

  // No upload url means this submit was a replay of one already past that
  // point. Re-uploading would be writing over a photograph the queue is reading.
  if (!submitted.upload) return submitted.job;

  await uploadPhoto(submitted.upload.url, request.photo);
  const queued = await call<{ job: PreviewJob }>(`/v1/previews/${submitted.job.id}/ready`, {
    method: 'POST',
  });
  return queued.job;
}

async function uploadPhoto(url: string, photo: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      body: photo,
      headers: { 'Content-Type': photo.type || 'image/jpeg' },
    });
  } catch {
    throw new ApiError(
      0,
      'upload_blocked',
      'the photo could not be uploaded — the storage bucket may not allow this origin',
    );
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'upload_failed', `the photo could not be uploaded (${response.status})`);
  }
}

export const fetchPreview = async (id: string, signal?: AbortSignal): Promise<PreviewJob> =>
  (await call<{ job: PreviewJob }>(`/v1/previews/${id}`, { signal })).job;

export const fetchPreviews = async (): Promise<PreviewJob[]> =>
  (await call<{ previews: PreviewJob[] }>('/v1/previews')).previews;

/**
 * Tells the server the preview has landed here, which deletes its copy.
 *
 * Called *after* the image bytes are in hand, never before. That ordering is
 * what makes the promise in `docs/preview-generation.md` true: download first so
 * nothing is lost, acknowledge second so nothing is kept.
 *
 * Its failure is not the user's problem — the look is already saved locally, and
 * an uncollected result is deleted by the retention sweep anyway. This call is
 * how that goes early rather than how it goes at all, which is why the caller
 * swallows it.
 */
export const collectPreview = (id: string): Promise<unknown> =>
  call(`/v1/previews/${id}/collected`, { method: 'POST' });

export const cancelPreview = (id: string): Promise<unknown> =>
  call(`/v1/previews/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/** Mirrors the `share` object returned by `POST /v1/shares`. */
export interface ShareLink {
  code: string;
  url: string;
  deepLink: string;
  title: string;
  caption: string;
  hairstyleId: string;
  hairstyleName: string;
  createdAt: number;
}

export interface ShareRequest {
  hairstyleId: string;
  gender?: Gender | null;
  hairType?: HairTypeId | null;
  lengthId?: HairLengthId | null;
  /**
   * The sharer's own handle for the look, so pressing Share twice on one result
   * is one link and one row in the funnel rather than two.
   */
  clientRef?: string | null;
}

/**
 * Mints a referral link for a hairstyle.
 *
 * **A share link names a hairstyle, never an image.** What unfurls in somebody
 * else's chat is the catalog's own mannequin render of that cut — public,
 * CDN-hosted, identical for everybody who shared it — and never a Luvo user's
 * face. `check-shares.mjs` asserts that server-side; it is restated here because
 * this call is the obvious place somebody would add a photo url, and it must
 * not be.
 *
 * The caption comes back from the server rather than being written here, on the
 * server's own reasoning: the caption is the advertisement, and it should be
 * tunable without a client release.
 */
export const createShareLink = async (request: ShareRequest): Promise<ShareLink> =>
  (
    await call<{ share: ShareLink }>('/v1/shares', {
      method: 'POST',
      body: JSON.stringify({ ...request, channel: 'system' }),
    })
  ).share;

/**
 * The funnel's event names, mirrored from `SHARE_EVENTS` in
 * `server/src/shareLinks.ts`.
 *
 * Mirrored rather than freely typed for the reason that file gives: a column
 * that is whatever the client felt like sending is a table nobody can group by
 * six months later. The server drops an unknown name rather than failing the
 * request, so being wrong here is silent — which is exactly why the union is
 * written out.
 */
export type ShareEventName =
  | 'share_opened'
  | 'share_channel_selected'
  | 'share_initiated'
  | 'share_completed'
  | 'share_dismissed'
  | 'share_failed'
  | 'share_link_opened'
  | 'share_install_attributed'
  | 'share_signup_attributed';

export interface ShareEvent {
  name: ShareEventName;
  code?: string | null;
  channel?: 'instagram' | 'whatsapp' | 'facebook' | 'system' | 'unknown' | null;
  props?: Record<string, unknown>;
}

/**
 * Records funnel events, batched.
 *
 * Fire-and-forget on purpose, and the swallow is the point rather than
 * carelessness: analytics that can fail a user's share costs more than it
 * measures. `platform: 'web'` is stamped here so the funnel can tell a browser
 * share from a phone's without the caller remembering to.
 */
export function recordEvents(events: ShareEvent[]): void {
  if (!hasApi || !events.length || !deviceSecret()) return;
  void call('/v1/events', {
    method: 'POST',
    body: JSON.stringify({ events: events.map((event) => ({ ...event, platform: 'web' })) }),
  }).catch(() => {});
}

export const recordEvent = (name: ShareEventName, event: Omit<ShareEvent, 'name'> = {}): void =>
  recordEvents([{ name, ...event }]);
