/**
 * fal.ai's queue, server side — submit, ask, collect.
 *
 * The third copy of this client in the repo and the first one that does not
 * contain a wait. `scripts/lib/fal.mjs` and `src/api/fal.ts` both submit a job
 * and then sit in a poll loop until it finishes, because in both of those a
 * human is watching a terminal or a screen and the process has nothing else to
 * do. Here the process has fifteen hundred other things to do, so the three
 * steps are three separate calls and the loop lives in `worker.ts`, where it can
 * poll every in-flight job on one tick.
 *
 * That is also what makes a job survive a deploy: the only thing needed to pick
 * up a generation someone else submitted is its `request_id`, which is in
 * Postgres. A worker can be killed mid-generation and the next one collects the
 * result — the money is spent at submit, and nothing about waiting for it is
 * held in memory.
 *
 * ## Why polling rather than webhooks
 *
 * fal will call a webhook on completion, and for a queue of any size that is the
 * right shape. This account's concurrency limit is **10** — the limit is set by
 * credits purchased over the last four weeks, and 40 is the ceiling on the
 * published table. Ten in-flight jobs polled every two seconds is five requests
 * a second, forever, which is nothing. Against that, a webhook adds a public
 * endpoint, an ed25519 signature to verify, a replay window to think about, and
 * a delivery failure mode that needs a polling reaper behind it anyway — the
 * complexity of both mechanisms to remove a load that does not exist. Revisit it
 * if the limit is ever raised past ~100; below that, polling is the cheaper
 * program.
 */

const QUEUE = 'https://queue.fal.run';

export type QueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export class FalError extends Error {
  readonly status: number | null;
  /**
   * Whether trying the same request again could plausibly work.
   *
   * The distinction is worth money. A 5xx, a timeout or a rate limit is the
   * queue having a bad minute and is worth one retry; a 400 or a content-policy
   * refusal will refuse identically forever, and retrying it is a second charge
   * for the same answer.
   */
  readonly retryable: boolean;

  constructor(message: string, status: number | null = null, retryable = false) {
    super(message);
    this.name = 'FalError';
    this.status = status;
    this.retryable = retryable;
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function call<T>(url: string, key: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Key ${key}`,
        accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : null),
      },
      body: body ? JSON.stringify(body) : undefined,
      // Long enough for a 2K edit to be accepted, short enough that a hung
      // socket does not occupy one of ten concurrency slots indefinitely.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    // A transport failure never reached fal, so nothing was charged and the
    // request is safe to make again.
    throw new FalError(`fal unreachable: ${error instanceof Error ? error.message : String(error)}`, null, true);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new FalError(
      `${response.status}: ${detail.slice(0, 400)}`,
      response.status,
      RETRYABLE.has(response.status),
    );
  }
  return payload as T;
}

export interface Submission {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

/**
 * Submits one generation and returns immediately.
 *
 * The urls fal hands back are kept rather than rebuilt, so sub-path models
 * (`openai/gpt-image-2/edit`) behave like top-level ones — the same reasoning as
 * the two sibling clients, and the same bug avoided.
 */
export async function submit(model: string, input: unknown, key: string): Promise<Submission> {
  const response = await call<{ request_id: string; status_url?: string; response_url?: string }>(
    `${QUEUE}/${model}`,
    key,
    input,
  );
  const requestId = response.request_id;
  if (!requestId) throw new FalError('fal accepted the request but returned no request_id');
  return {
    requestId,
    statusUrl: response.status_url ?? `${QUEUE}/${model}/requests/${requestId}/status`,
    responseUrl: response.response_url ?? `${QUEUE}/${model}/requests/${requestId}`,
  };
}

export async function status(statusUrl: string, key: string): Promise<{ status: QueueStatus; error?: unknown }> {
  return call<{ status: QueueStatus; error?: unknown }>(statusUrl, key);
}

/** The shape every fal image model answers with. */
interface ImageResponse {
  images?: { url?: string; width?: number; height?: number }[];
  image?: { url?: string; width?: number; height?: number };
}

export interface FalImage {
  url: string;
  width: number | null;
  height: number | null;
}

export async function result(responseUrl: string, key: string): Promise<FalImage> {
  const payload = await call<ImageResponse>(responseUrl, key);
  const image = payload?.images?.[0] ?? payload?.image;
  if (!image?.url) throw new FalError('the model returned no image');
  return { url: image.url, width: image.width ?? null, height: image.height ?? null };
}

/** Best effort — a generation nobody is waiting for is still one being paid for. */
export async function cancel(statusUrl: string, key: string): Promise<void> {
  try {
    await fetch(statusUrl.replace(/\/status$/, '/cancel'), {
      method: 'PUT',
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // A job that cannot be cancelled finishes and is scrubbed by the sweeper.
  }
}
