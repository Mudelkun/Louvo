/**
 * The worker: the only process that holds the generator key, and the only one
 * that ever touches an image.
 *
 * Deploy it as a second Railway service off this same directory, with the start
 * command `npm run start:worker`. It is separate from the API on purpose. The
 * API must answer in milliseconds under a burst; the worker's pace is set by
 * fal's concurrency limit and a generation takes the better part of a minute.
 * Those are two different scaling curves, and running them in one process means
 * a queue drain competing with a user pressing Generate.
 *
 * ## One tick
 *
 * 1. **Recover** jobs whose worker died between claiming and submitting. Nothing
 *    was spent on those, so they go back on the queue.
 * 2. **Poll** everything at fal. One status call per in-flight job — at a limit
 *    of ten that is five requests a second, which is why this is a poll loop and
 *    not a webhook endpoint (`fal.ts` has the full argument).
 * 3. **Submit** into whatever slots are free.
 * 4. **Sweep** — uploads that never arrived, results nobody collected.
 *
 * Every step is driven by Postgres rather than by memory, so two workers is a
 * configuration change and killing one loses nothing but the current tick.
 *
 * ## What it does with the photograph
 *
 * Reads it once, as a signed url handed to fal, and deletes it the moment the
 * job settles — success, failure or cancellation. The delete is part of the
 * state transition in `jobs.ts` rather than a step here, so there is no ordering
 * in which this loop can crash and leave a photograph behind. The sweep at the
 * end is for objects whose row was lost, not the mechanism.
 */

import { getCatalog } from './catalog.js';
import { query } from './db.js';
import { env } from './env.js';
import { FalError, cancel as cancelFal, result as falResult, status as falStatus, submit } from './fal.js';
import {
  abandonedUploads,
  claimNext,
  countRunning,
  expiredLeases,
  expiredResults,
  extendLease,
  getJob,
  leaseFor,
  markCancelled,
  markFailed,
  markReady,
  markSubmitted,
  requeue,
  resultKey,
  retentionDeadline,
  runningJobs,
  type JobRow,
} from './jobs.js';
import { pushTokenFor, setPushToken } from './devices.js';
import { readyMessage, sendPush } from './push.js';
import { storage } from './storage.js';
import { buildRequest } from './tryOn.js';

/**
 * How many times one job may be sent to fal.
 *
 * Two, and only for failures that could plausibly go the other way — see
 * `FalError.retryable`. Every attempt is real money on a model that will refuse
 * a bad request identically forever, so an aggressive retry policy here is a
 * bill rather than a resilience feature. It is the same conclusion the mannequin
 * generators reached from the other direction: they shoot each sheet exactly
 * once and report what came back wrong rather than re-rolling it.
 */
const MAX_ATTEMPTS = 2;

/** Long enough for a slow submit, short enough that a dead worker is noticed. */
const LEASE_SECONDS = 180;
/** A generation that has not finished in this long is not going to. */
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

const log = (message: string, extra: Record<string, unknown> = {}): void => {
  // Deliberately structured and deliberately without a key, a url or a
  // dimension in it: this is the process that handles photographs of people, and
  // a log line naming the object is a copy of the thing we promised not to keep.
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));
};

let running = true;
let ticking = false;

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

/**
 * Removes an object and never throws.
 *
 * A failed delete must not be able to abort the transition that follows it,
 * because the transition is what stops the job being retried forever. A missed
 * object is picked up by the sweep; an unsettled job is a stuck slot.
 */
async function discard(key: string | null): Promise<void> {
  if (!key || !storage) return;
  try {
    await storage.remove(key);
  } catch (error) {
    log('scrub failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

async function submitJob(job: JobRow): Promise<void> {
  if (!storage || !env.previews.falKey) return;
  if (!job.photo_key) {
    await markFailed(job.id, 'the photograph is no longer available', 'photo_missing');
    return;
  }

  try {
    const catalog = await getCatalog();
    const request = buildRequest({
      catalog,
      job,
      // Minted per submission rather than stored: this is the only window in
      // which the photograph is readable by anything but the device, and it is
      // measured in minutes.
      photoUrl: storage.presignGet(job.photo_key, env.previews.downloadTtlSeconds),
    });

    const submitted = await submit(request.model, request.input, env.previews.falKey);
    await markSubmitted(job.id, {
      requestId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      responseUrl: submitted.responseUrl,
      model: request.model,
      variant: request.variant,
      views: request.views,
      leaseUntil: leaseFor(LEASE_SECONDS),
    });
    log('submitted', { job: job.id, model: request.model, variant: request.variant, attempt: job.attempts });
  } catch (error) {
    await failOrRetry(job, error);
  }
}

/**
 * One failure, resolved into either another attempt or a sentence for a tile.
 *
 * The photograph is only kept when the job is actually going round again. A
 * terminal failure scrubs it in the same statement that records the reason —
 * there is nothing left to generate from, so there is nothing left to hold.
 */
async function failOrRetry(job: JobRow, error: unknown): Promise<void> {
  const fal = error instanceof FalError ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  const code = fal?.status ? `fal_${fal.status}` : 'generation_failed';

  if (fal?.retryable && job.attempts < MAX_ATTEMPTS) {
    await requeue(job.id, message, code);
    log('retrying', { job: job.id, attempt: job.attempts, code });
    return;
  }

  await discard(job.photo_key);
  await markFailed(job.id, message, code);
  log('failed', { job: job.id, code });
}

// ---------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------

/**
 * Pulls the finished image out of fal and into the transient bucket.
 *
 * The one place image bytes pass through this process, and it is unavoidable:
 * fal's own url expires in hours and the phone may be off for days. Copying it
 * costs a couple of megabytes once per job, which at a limit of ten concurrent
 * generations is a rounding error against the model's own latency.
 *
 * A job cancelled while it was generating is collected and immediately thrown
 * away rather than skipped, because the alternative is leaving an image of
 * somebody's face on fal's storage after they asked us to stop.
 */
async function collect(job: JobRow): Promise<void> {
  if (!storage || !env.previews.falKey || !job.fal_response_url) return;

  const image = await falResult(job.fal_response_url, env.previews.falKey);
  const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new FalError(`could not download the result: ${response.status}`, response.status, true);
  const bytes = Buffer.from(await response.arrayBuffer());

  // Re-read: the user may have cancelled while the model was working, and their
  // preview must not be written to a bucket after that.
  const current = await getJob(job.id);
  if (!current || current.status === 'cancelled') {
    await discard(job.photo_key);
    log('discarded after cancel', { job: job.id });
    return;
  }

  const key = resultKey(job.id);
  await storage.put(key, bytes, 'image/png');
  await markReady(job.id, {
    resultKey: key,
    width: image.width,
    height: image.height,
    expiresAt: retentionDeadline(),
  });
  // After the row no longer names it, so a crash between the two leaves an
  // orphan for the sweep rather than a job pointing at nothing.
  await discard(job.photo_key);
  log('ready', { job: job.id, bytes: bytes.length });

  await notify(job);
}

/**
 * The notification, and the reason the app was allowed to close.
 *
 * Failures are deliberately silent. A push saying a generation failed arrives on
 * a lock screen with nothing to do about it; the job tile in the app says what
 * went wrong and offers the retry, which is where that conversation belongs.
 */
async function notify(job: JobRow): Promise<void> {
  try {
    const registration = await pushTokenFor(job.device_id);
    if (!registration) return;

    const catalog = await getCatalog();
    const hairstyle = catalog.hairstyles.find((style) => style.id === job.hairstyle_id);
    const { title, body } = readyMessage(hairstyle?.name ?? 'new haircut');

    const { dead } = await sendPush([
      { token: registration.token, title, body, data: { previewId: job.id, hairstyleId: job.hairstyle_id } },
    ]);
    if (dead.length) await setPushToken(job.device_id, { token: null, platform: null });
  } catch (error) {
    log('push failed', { job: job.id, error: error instanceof Error ? error.message : String(error) });
  }
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/** Jobs claimed by a worker that died before it sent anything. Free to redo. */
async function recover(): Promise<void> {
  for (const job of await expiredLeases(new Date())) {
    if (!job.fal_request_id) {
      await requeue(job.id, 'the worker restarted before this was sent', 'worker_restart');
      log('recovered', { job: job.id });
    } else {
      // It is at fal and every worker polls every in-flight job, so the lease
      // only needs to stop this from being requeued and charged twice.
      await extendLease(job.id, leaseFor(LEASE_SECONDS));
    }
  }
}

async function poll(): Promise<void> {
  if (!env.previews.falKey) return;

  for (const job of await runningJobs()) {
    if (!job.fal_status_url) continue;

    const age = Date.now() - (job.submitted_at ?? job.created_at).getTime();
    if (age > GENERATION_TIMEOUT_MS) {
      await cancelFal(job.fal_status_url, env.previews.falKey);
      await discard(job.photo_key);
      await markFailed(job.id, 'the generator took too long', 'timeout');
      log('timed out', { job: job.id });
      continue;
    }

    try {
      const state = await falStatus(job.fal_status_url, env.previews.falKey);
      if (state.status === 'COMPLETED') {
        await collect(job);
      } else if (state.status === 'FAILED' || state.error) {
        await failOrRetry(job, new FalError(JSON.stringify(state.error ?? state).slice(0, 300)));
      }
    } catch (error) {
      // A status call that fails is not a generation that failed: the job stays
      // running and is asked again next tick. Only `collect` throwing — where the
      // model has genuinely finished — is worth resolving as an outcome.
      if (error instanceof FalError && !error.retryable) await failOrRetry(job, error);
      else log('poll error', { job: job.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/**
 * Fills the free slots.
 *
 * `maxInflight` is the account's real concurrency limit — 10 on this plan, 40 at
 * the top of fal's published table — not a safety margin. Submitting past it buys
 * rejections rather than throughput, which is why a burst of fifteen hundred is a
 * queue rather than a failure.
 */
async function dispatch(): Promise<void> {
  let free = env.previews.maxInflight - (await countRunning());
  while (running && free > 0) {
    const job = await claimNext(leaseFor(LEASE_SECONDS), env.previews.maxInflightPerDevice);
    if (!job) return;
    await submitJob(job);
    free -= 1;
  }
}

/**
 * Everything the state machine did not already delete.
 *
 * Two real cases and one that should never happen. Uploads that never arrived
 * are jobs the app abandoned between the two calls; expired results are previews
 * nobody came back for, deleted whether or not they were collected — the phone is
 * where a preview lives, this is only the hand-off window.
 */
async function sweep(): Promise<void> {
  const now = new Date();

  for (const job of await abandonedUploads(new Date(now.getTime() - env.previews.uploadTtlSeconds * 1000))) {
    await discard(job.photo_key);
    await markCancelled(job.id);
    log('abandoned', { job: job.id });
  }

  for (const job of await expiredResults(now)) {
    await discard(job.result_key);
    // Not `collected`: nobody collected it. The distinction is the difference
    // between a preview that reached its owner and one that did not, and it is
    // the number to watch if the retention window is ever argued about.
    await query(
      `update preview_jobs set status = 'failed', error = $2, error_code = 'expired',
              result_key = null, expires_at = null, updated_at = now()
        where id = $1`,
      [job.id, 'this preview was not collected in time'],
    );
    log('expired', { job: job.id });
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await recover();
    await poll();
    await dispatch();
    await sweep();
  } catch (error) {
    // One bad tick must not end the worker: the next one re-reads every piece of
    // state it needs from Postgres, so there is nothing to recover in memory.
    log('tick failed', { error: error instanceof Error ? error.message : String(error) });
  } finally {
    ticking = false;
  }
}

async function main(): Promise<void> {
  if (!storage || !env.previews.falKey) {
    console.error('the worker needs FAL_KEY and a PREVIEW_BUCKET — see server/.env.example');
    process.exit(1);
  }
  /**
   * The bucket, checked before anything is claimed.
   *
   * "Fail the deploy rather than the first request" — the same rule
   * `assertConnectable` applies to Postgres, applied to the one other thing this
   * process cannot work without. It earns its place: a missing or misnamed
   * bucket does not fail here, it fails at Cloudflare when a *phone* tries its
   * presigned upload, which is the one place in the whole pipeline no server of
   * ours can see. The symptom is a job sitting in `awaiting_upload` and a
   * progress bar stopped at the prepare stage's ceiling, which looks exactly
   * like a busy queue.
   */
  try {
    if (!(await storage.bucketExists())) {
      console.error(
        `the bucket "${env.previews.storage?.bucket}" does not exist (PREVIEW_BUCKET). ` +
          'Create it in R2 — private, with no public domain and no CDN in front of it — ' +
          'and make sure the R2 token has Object Read & Write on it.',
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(`could not reach the bucket: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  log('worker started', {
    model: env.previews.model,
    quality: env.previews.quality,
    maxInflight: env.previews.maxInflight,
    retentionDays: env.previews.retentionDays,
    bucket: env.previews.storage?.bucket,
  });

  const timer = setInterval(() => void tick(), env.previews.pollMs);

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      log('shutting down', { signal });
      running = false;
      clearInterval(timer);
      // Nothing to drain: a claimed job that was never submitted is recovered by
      // its lease, and a submitted one is at fal with its request id in Postgres.
      setTimeout(() => process.exit(0), 1000).unref();
    });
  }

  await tick();
}

await main();
