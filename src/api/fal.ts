/**
 * fal.ai queue client, app side.
 *
 * A deliberate near-copy of `scripts/lib/fal.mjs` rather than a shared module,
 * for the same reason `src/lib/hairTypes.ts` and `scripts/lib/variants.mjs` are
 * mirrors: nothing under `scripts/` may import from `src/`, and nothing in the
 * app may import from `scripts/`. The two differ where they have to — this one
 * reports progress while it waits, because a user is watching, and it can be
 * cancelled, because the user can leave.
 *
 * It has moved server-side: `server/src/fal.ts` is where a shipped build's
 * generations are submitted from, and it has no wait in it at all — the worker
 * polls every in-flight job on one tick rather than holding a promise per job.
 * This copy is what a checkout with no server runs on, and it is reached only
 * when `EXPO_PUBLIC_API_URL` is unset. The key it uses is compiled into the
 * bundle and readable by anyone with the app, which is exactly why the other one
 * exists; do not make this the default path again.
 */

const QUEUE = 'https://queue.fal.run';

export class FalError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FalError';
    this.status = status;
  }
}

/** The queue states worth telling a user apart. */
export type QueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface RunOptions {
  key: string;
  /** Raised so the caller can stop polling when the user cancels a job. */
  signal?: AbortSignal;
  onStatus?: (status: QueueStatus) => void;
  timeoutMs?: number;
  pollMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      // Not a DOMException: Hermes has no such global, and throwing a
      // ReferenceError out of the cancel path would report a cancelled job as a
      // crashed one. The name is what callers actually match on.
      const aborted = new Error('aborted');
      aborted.name = 'AbortError';
      reject(aborted);
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
  });

async function call<T>(url: string, { key, signal, body }: { key: string; signal?: AbortSignal; body?: unknown }) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    signal,
    headers: {
      Authorization: `Key ${key}`,
      accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new FalError(`${url} -> ${response.status}: ${detail.slice(0, 400)}`, response.status);
  }
  return payload as T;
}

interface Submitted {
  request_id: string;
  status_url?: string;
  response_url?: string;
  status?: QueueStatus;
}

/**
 * Submits one job and follows it to completion.
 *
 * The polling urls fal hands back are followed rather than rebuilt, so
 * sub-path models (`fal-ai/nano-banana/edit`) behave like top-level ones.
 */
export async function runModel<T>(model: string, input: unknown, options: RunOptions): Promise<T> {
  const { key, signal, onStatus, timeoutMs = 240_000, pollMs = 1500 } = options;

  const submitted = await call<Submitted>(`${QUEUE}/${model}`, { key, signal, body: input });
  const statusUrl = submitted.status_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}`;

  let last: QueueStatus = submitted.status ?? 'IN_QUEUE';
  onStatus?.(last);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs, signal);
    const status = await call<{ status: QueueStatus; error?: unknown }>(statusUrl, { key, signal });

    if (status.status !== last) {
      last = status.status;
      onStatus?.(last);
    }
    if (status.status === 'COMPLETED') return call<T>(responseUrl, { key, signal });
    if (status.status === 'FAILED' || status.error) {
      throw new FalError(`generation failed: ${JSON.stringify(status.error ?? status).slice(0, 300)}`);
    }
  }

  throw new FalError(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${model}`);
}

/** The shape every fal image model answers with. */
export interface ImageResponse {
  images?: { url?: string }[];
  image?: { url?: string };
}

/** Pulls the first image url out of a fal image-model response. */
export function firstImageUrl(result: ImageResponse): string {
  const url = result?.images?.[0]?.url ?? result?.image?.url;
  if (!url) throw new FalError('the model returned no image');
  return url;
}
