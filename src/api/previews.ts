/**
 * Preview generation, through the backend.
 *
 * The replacement for the app calling fal.ai directly (`src/api/tryOn.ts`), and
 * the three things it changes are the three things that were wrong with that:
 *
 * - **The key is gone from the bundle.** `EXPO_PUBLIC_FAL_KEY` was compiled into
 *   every build and anybody with the app could read it out. The server holds it
 *   now.
 * - **The job outlives the screen.** The old path was a promise: leaving the app
 *   killed the generation. Now the work is a row in Postgres, the phone is only
 *   watching it, and a notification arrives whether or not the app is open.
 * - **The photograph is not carried by us.** It goes from the phone straight to
 *   a private bucket on a url the server signed, is read once by the model, and
 *   is deleted the moment the job settles. It never touches the API process and
 *   it is never in a database.
 *
 * What has *not* changed is the thing that makes a preview any good: the model
 * is shown the catalog's own render of the cut rather than told its name. That
 * moved to `server/src/tryOn.ts`, unchanged, along with the authored prompt.
 *
 * ## The result belongs to the phone
 *
 * The finished preview is downloaded and then explicitly *collected* — one more
 * call, which deletes the server's copy. That is the ordering that makes the
 * promise true: download first so nothing is lost, acknowledge second so nothing
 * is kept. A preview then lives in the app's own documents directory for as long
 * as its owner keeps it, and there is no copy of it anywhere else.
 */

import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { API_BASE_URL, hasApi } from '@/api/client';
import type { Gender, HairLengthId, HairTypeId } from '@/api/types';
import { DEMO_PHOTO } from '@/lib/constants';
import { deviceHeader } from '@/lib/deviceId';
import { photoPixelSize } from '@/lib/imageData';

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
  queuePosition?: number;
  error?: string;
  errorCode?: string;
  result?: { url: string; width: number | null; height: number | null; expiresAt: number };
}

interface SubmitResponse {
  job: PreviewJob;
  upload: { method: string; url: string; expiresIn: number; maxBytes: number } | null;
}

export class PreviewError extends Error {
  readonly code: string;
  /** 0 when the request never got a response at all — see `uploadPhoto`. */
  readonly status: number;

  constructor(message: string, code: string, status: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PreviewError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Whether this build generates previews on the backend.
 *
 * Only asks whether there is an API. Whether that deployment has a generator key
 * is the deployment's business and it answers `previews_unconfigured` if not —
 * the same shape as the catalog's three outcomes, where the app finds out what
 * it actually got rather than predicting it.
 */
export const previewsConfigured = (): boolean => hasApi();

/** The sample photo has no pixels behind it, so it has nothing to generate from. */
export const canSubmit = (photoUri: string | null | undefined): boolean =>
  previewsConfigured() && !!photoUri && photoUri !== DEMO_PHOTO;

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
      throw new PreviewError(
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
// The photograph
// ---------------------------------------------------------------------------

/**
 * The longest edge the model is sent.
 *
 * A modern phone photo is 12 megapixels and 4 MB; the preview comes back at
 * about 2 megapixels, so everything above this is upload time and transient
 * storage spent on detail the model discards. 1536 keeps the head comfortably
 * above the resolution where strand detail starts disappearing — the failure
 * `TRY_ON_RESOLUTION` exists for, approached from the input side.
 */
const MAX_EDGE = 1536;
const QUALITY = 0.85;

export interface PreparedPhoto {
  uri: string;
  width: number | null;
  height: number | null;
}

/**
 * Downscales a photo for upload, or hands back what it was given.
 *
 * Best effort on purpose: a photo that cannot be measured or re-encoded is
 * uploaded as it is. Failing a generation because a resize failed would be
 * trading the feature for an optimisation.
 */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  const size = await photoPixelSize(uri);
  if (!size) return { uri, width: null, height: null };
  if (Math.max(size.width, size.height) <= MAX_EDGE) return { uri, ...size };

  try {
    const portrait = size.height >= size.width;
    const result = await manipulateAsync(
      uri,
      // One edge only: the other follows, so the aspect the output is matched to
      // is the aspect the user actually photographed.
      [{ resize: portrait ? { height: MAX_EDGE } : { width: MAX_EDGE } }],
      { compress: QUALITY, format: SaveFormat.JPEG },
    );
    return { uri: result.uri, width: result.width, height: result.height };
  } catch {
    return { uri, ...size };
  }
}

/**
 * How long the upload gets before it is called a failure.
 *
 * Generous — this is a phone's uplink and a few hundred kilobytes — but finite,
 * and the finiteness is the point. Everything else in this flow has a deadline;
 * an upload that hangs leaves the job in `awaiting_upload` on the server, which
 * the app draws as the prepare stage creeping toward its ceiling and stopping.
 * A wait with no end and no error reads as a slow queue, and the user's only way
 * out is Cancel.
 */
const UPLOAD_TIMEOUT_MS = 90_000;

/** Rejects if the upload has not finished in time, whatever the platform does. */
function withDeadline<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new PreviewError('the photo upload timed out', 'upload_failed', 408)),
        UPLOAD_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * PUTs the photograph to the signed url.
 *
 * Native streams the file out of the filesystem rather than reading it into
 * JavaScript first; the web build has no filesystem and sends the blob. Neither
 * carries the device header — the url *is* the authorisation, and it is the one
 * request in this module that does not go to our API at all.
 *
 * Which is also why it needs its own deadline and its own error. This request
 * goes to Cloudflare, so when it fails it fails somewhere no server of ours can
 * see: a wrong `PREVIEW_BUCKET` is a `404 NoSuchBucket` visible only here.
 * `result.body` is carried into the message for exactly that case — S3 puts the
 * reason in the response body and nothing else in the pipeline will ever
 * mention it.
 */
export async function uploadPhoto(url: string, uri: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      const response = await withDeadline(fetch(url, { method: 'PUT', body: blob }));
      if (!response.ok) {
        throw new PreviewError(uploadFailure(response.status, await response.text()), 'upload_failed', response.status);
      }
      return;
    }

    await uploadNative(url, uri);
  } catch (error) {
    // A transport failure here has no status and no body to explain it, and on
    // the web it has no *cause* either: a browser reports a blocked preflight to
    // JavaScript as a bare `TypeError: Failed to fetch`, deliberately, so that a
    // page cannot probe what it is not allowed to reach. Left raw it reached the
    // user as "no connection to the generator" — which sent everyone looking at
    // the API, the one part of the flow this request never touches.
    //
    // So it is named for the step it failed at rather than for a cause nobody
    // has. `upload_failed` is what the tile reads from; `cause` keeps whatever
    // the platform did say for the console line in `describeFailure`.
    if (error instanceof PreviewError) throw error;
    throw new PreviewError('the photo could not be uploaded', 'upload_failed', 0, { cause: error });
  }
}

/**
 * The native PUT, with a second way of making the same request.
 *
 * **`sessionType: 'foreground'`, and that is the fix.** `File.upload` defaults to
 * a *background* `URLSession` on iOS, which is run out of process by
 * `nsurlsessiond` — a different sandbox, a different TLS stack, and much the
 * least exercised path under Expo Go, where the session identifier belongs to
 * Expo Go rather than to this app. It was failing there while the identical
 * request from the web build succeeded.
 *
 * Nothing was being bought with it. A background session's whole point is that
 * the transfer survives the app being suspended — but the upload is only step
 * two of three, and step three (`POST /ready`) is a JavaScript call that needs a
 * live runtime. An upload that completes while the app is asleep leaves the job
 * in `awaiting_upload` exactly as an interrupted one does. The durability
 * promise on this flow starts *after* the photograph is up, and it is kept by
 * the row in Postgres, not by the URLSession.
 *
 * The `fetch` fallback is honest belt-and-braces: this failure could not be
 * reproduced off the affected phone, so if the native task still cannot run, the
 * request is made the way the web build makes it — `File` implements `Blob`, so
 * it is the same bytes with the same method to the same url. A `PreviewError`
 * means the bucket *answered* and refused, or the deadline passed; that is an
 * answer, and sending it again more slowly would not improve it.
 */
async function uploadNative(url: string, uri: string): Promise<void> {
  const file = new File(uri);

  try {
    const result = await withDeadline(
      file.upload(url, { httpMethod: 'PUT', mimeType: 'image/jpeg', sessionType: 'foreground' }),
    );
    if (result.status < 200 || result.status >= 300) {
      throw new PreviewError(uploadFailure(result.status, result.body), 'upload_failed', result.status);
    }
    return;
  } catch (error) {
    if (error instanceof PreviewError) throw error;
    console.warn('[luvo] native upload task failed, retrying as a plain PUT:', error);
  }

  const response = await withDeadline(fetch(url, { method: 'PUT', body: file }));
  if (!response.ok) {
    throw new PreviewError(uploadFailure(response.status, await response.text()), 'upload_failed', response.status);
  }
}

/** S3 explains itself in XML; the one word that matters is the error code. */
function uploadFailure(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body ?? '')?.[1];
  return code ? `the photo could not be uploaded (${status} ${code})` : `the photo could not be uploaded (${status})`;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export interface SubmitRequest {
  hairstyleId: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId?: HairLengthId | null;
  photoUri: string;
  /** Survives a retried POST without becoming a second generation, and a second
   * generation is a second five cents. */
  idempotencyKey: string;
  /**
   * The server's id for this job, as soon as it exists — before the photograph
   * has been uploaded, not after the whole sequence returns.
   *
   * This is what makes cancelling work during the slowest part of the flow. The
   * job row is created by the first of three calls, but the caller used to learn
   * its id only when all three had finished; press the cross during the upload
   * and the app had nothing to cancel, so it removed the tile and left a real job
   * on the server that nobody was watching. A hanging upload made that window
   * minutes long rather than milliseconds.
   */
  onCreated?: (previewId: string) => void;
}

/**
 * Creates the job, uploads the photograph, and releases it to the queue.
 *
 * Three calls rather than one multipart POST, and the split is what keeps image
 * bytes off the API entirely: the middle one goes to the bucket. It also means
 * the flaky, expensive half can be retried on its own — the job already exists
 * and re-uploading to the same signed url costs nothing.
 */
export async function submitPreview(request: SubmitRequest): Promise<PreviewJob> {
  const photo = await preparePhoto(request.photoUri);

  const submitted = await call<SubmitResponse>('/v1/previews', {
    method: 'POST',
    body: JSON.stringify({
      hairstyleId: request.hairstyleId,
      gender: request.gender,
      hairType: request.hairType,
      lengthId: request.lengthId ?? null,
      photoWidth: photo.width,
      photoHeight: photo.height,
      idempotencyKey: request.idempotencyKey,
    }),
  });

  request.onCreated?.(submitted.job.id);

  // No upload url means this submit was a replay of one already past that point.
  // Re-uploading would be writing over a photograph the queue is reading.
  if (submitted.upload) {
    await uploadPhoto(submitted.upload.url, photo.uri);
    const queued = await call<{ job: PreviewJob }>(`/v1/previews/${submitted.job.id}/ready`, { method: 'POST' });
    return queued.job;
  }
  return submitted.job;
}

export async function fetchPreview(id: string): Promise<PreviewJob> {
  return (await call<{ job: PreviewJob }>(`/v1/previews/${id}`)).job;
}

/** Everything this device has in flight — how a restarted app finds its work. */
export async function fetchPreviews(): Promise<PreviewJob[]> {
  return (await call<{ previews: PreviewJob[] }>('/v1/previews')).previews;
}

/**
 * Tells the server the preview has landed on the phone, which deletes it there.
 *
 * Called *after* the download, never before, and its failure is not the user's
 * problem: the look is already saved, and an uncollected result is deleted by
 * the retention sweep anyway. The call is how it goes early rather than how it
 * goes at all.
 */
export async function collectPreview(id: string): Promise<void> {
  await call(`/v1/previews/${id}/collected`, { method: 'POST' });
}

export async function cancelPreview(id: string): Promise<void> {
  await call(`/v1/previews/${id}`, { method: 'DELETE' });
}

export async function registerPushToken(token: string | null, platform: string): Promise<void> {
  await call('/v1/devices/push', { method: 'POST', body: JSON.stringify({ token, platform }) });
}
