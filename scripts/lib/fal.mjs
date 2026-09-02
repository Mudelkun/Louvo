/**
 * Minimal fal.ai queue client — no SDK, no dependencies.
 *
 * Submit returns the polling URLs, and we follow the ones fal hands back rather
 * than rebuilding them, so sub-path models (`fal-ai/nano-banana/edit`) work the
 * same as top-level ones.
 */

const QUEUE = 'https://queue.fal.run';

export class FalError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'FalError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function call(url, { key, method = 'GET', body }) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${key}`,
      accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readBody(res);
  if (!res.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new FalError(`${method} ${url} -> ${res.status} ${res.statusText}: ${detail}`, {
      status: res.status,
      body: payload,
    });
  }
  return payload;
}

/**
 * Runs one model to completion.
 *
 * @param {string} model      e.g. 'fal-ai/nano-banana/edit'
 * @param {object} input      model input payload
 * @param {{ key: string, timeoutMs?: number, pollMs?: number, onStatus?: (s: string) => void }} opts
 */
export async function runModel(model, input, { key, timeoutMs = 300_000, pollMs = 1500, onStatus }) {
  const submitted = await call(`${QUEUE}/${model}`, { key, method: 'POST', body: input });
  const statusUrl = submitted.status_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}`;

  const deadline = Date.now() + timeoutMs;
  let last = submitted.status ?? 'IN_QUEUE';
  onStatus?.(last);

  while (Date.now() < deadline) {
    await sleep(pollMs);
    const status = await call(statusUrl, { key });
    if (status.status !== last) {
      last = status.status;
      onStatus?.(last);
    }
    if (status.status === 'COMPLETED') {
      return call(responseUrl, { key });
    }
    if (status.status === 'FAILED' || status.status === 'ERROR' || status.error) {
      throw new FalError(`generation failed: ${JSON.stringify(status.error ?? status)}`, { body: status });
    }
  }

  throw new FalError(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${model}`);
}

/** Pulls the first image out of a fal image-model response. */
export function firstImage(result) {
  const image = result?.images?.[0] ?? result?.image;
  if (!image?.url) {
    throw new FalError(`no image in response: ${JSON.stringify(result).slice(0, 400)}`);
  }
  return image;
}

/** Downloads a fal image url (or decodes a data: uri) into a Buffer. */
export async function fetchImageBytes(url) {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    return Buffer.from(url.slice(comma + 1), 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) throw new FalError(`GET ${url} -> ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Retries transient failures (rate limits, 5xx, timeouts) with backoff. */
export async function withRetry(label, attempts, fn) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const status = error?.status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt === attempts) break;
      const wait = 2000 * attempt ** 2;
      console.warn(`  ↻ ${label}: ${error.message.slice(0, 160)} — retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastError;
}
