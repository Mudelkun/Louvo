/**
 * The job queue: one Postgres table, claimed by compare-and-set.
 *
 * Not Redis, and the reasoning is worth keeping. The queue is *the same row* as
 * the job's own state, so there is no window in which a job exists in one and
 * not the other, no reconciliation between two stores, and no second stateful
 * service to pay for and monitor on a Railway plan. Every question anybody will
 * actually ask — how many are waiting, what did this user's last one do, which
 * ones are stuck — is a select. At this account's concurrency limit of 10 the
 * throughput ceiling is fal's, by roughly three orders of magnitude; the day
 * that stops being true is the day this becomes BullMQ, and that day is a long
 * way off.
 *
 * ## The scrub is a state transition, not a cleanup job
 *
 * Every path out of `running` — completion, failure, cancellation, expiry —
 * deletes the photograph and nulls the column that named it, in the same call
 * that moves the status. There is no code path that leaves a job settled and a
 * photograph behind, which is what makes "the photo is in flight, never at rest"
 * a property of the state machine rather than a promise about a cron job. The
 * sweeper in `worker.ts` exists to catch objects whose row was lost, not to be
 * the mechanism.
 *
 * The credit charged for the generation settles on those same transitions and
 * for the same reason — see `settle` in `credits.ts`. It cannot be the *same*
 * statement, because a balance lives in another table, so those three
 * transitions are the one place in this service that opens a transaction.
 *
 * ## No intervals in SQL
 *
 * Every timestamp this module writes is computed in JavaScript and passed as a
 * parameter. It reads slightly longer than `now() + interval '7 days'` and it
 * means the whole module runs on any Postgres, including the in-memory one
 * `check-previews.mjs` uses — a test that cannot exercise the claim query is not
 * a test of a queue.
 */

import { randomBytes } from 'node:crypto';

import { settle } from './credits.js';
import { query, withTransaction } from './db.js';
import { env } from './env.js';
import type { Gender, HairLengthId, HairTypeId, VariantId, ViewAngle } from './types.js';

/**
 * ```
 * awaiting_upload -> queued -> running -> ready -> collected
 *                                     \-> failed
 *          (any of the first four) ----> cancelled
 * ```
 *
 * `collected` is the terminal state that matters most: it means the device has
 * the preview and our copy is gone. A preview lives on the phone that generated
 * it, for as long as its owner keeps it; `ready` is only the hand-off.
 */
export const JOB_STATUSES = [
  'awaiting_upload',
  'queued',
  'running',
  'ready',
  'collected',
  'failed',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  id: string;
  device_id: string;
  status: JobStatus;
  hairstyle_id: string;
  gender: Gender;
  hair_type: HairTypeId | null;
  length_id: HairLengthId | null;
  color_id: string | null;
  photo_width: number | null;
  photo_height: number | null;
  photo_key: string | null;
  result_key: string | null;
  result_width: number | null;
  result_height: number | null;
  variant: VariantId | null;
  views: ViewAngle[];
  fal_request_id: string | null;
  fal_model: string | null;
  fal_status_url: string | null;
  fal_response_url: string | null;
  attempts: number;
  error: string | null;
  error_code: string | null;
  idempotency_key: string | null;
  /** Which pot this generation was taken out of. Null when credits are off. */
  charge_source: 'free' | 'paid' | null;
  charge_settled: 'spent' | 'refunded' | null;
  created_at: Date;
  updated_at: Date;
  submitted_at: Date | null;
  ready_at: Date | null;
  expires_at: Date | null;
  lease_until: Date | null;
}

const COLUMNS = `id, device_id, status, hairstyle_id, gender, hair_type, length_id, color_id,
  photo_width, photo_height, photo_key, result_key, result_width, result_height,
  variant, views, fal_request_id, fal_model, fal_status_url, fal_response_url,
  attempts, error, error_code, idempotency_key, charge_source, charge_settled,
  created_at, updated_at, submitted_at, ready_at, expires_at, lease_until`;

/** Unguessable, and short enough to sit in a url. */
const token = (bytes: number): string => randomBytes(bytes).toString('base64url');

export const newJobId = (): string => `pv_${token(12)}`;

/**
 * Where a job's two objects live.
 *
 * The path carries no user id, no device id and no hairstyle — a listing of the
 * bucket says nothing about who anything belongs to, which matters because a
 * bucket listing is the one thing a leaked read-only credential gives away. The
 * random half is what makes the key unguessable; the `in/` and `out/` split
 * exists so a lifecycle rule can be written against each independently.
 */
export const photoKey = (jobId: string): string => `in/${jobId}/${token(24)}`;
export const resultKey = (jobId: string): string => `out/${jobId}/${token(24)}`;

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface NewJob {
  id: string;
  deviceId: string;
  hairstyleId: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId: HairLengthId | null;
  colorId: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoKey: string;
  idempotencyKey: string | null;
}

/**
 * Creates a job in `awaiting_upload`, or hands back the one this request already
 * created.
 *
 * The idempotency key is not politeness. A preview is about five cents and a
 * phone on a bad connection retries a POST it never saw the response to; without
 * this, "my preview generated twice and I was charged for both" is a bug report
 * waiting to be written. `on conflict do nothing` plus a re-read is the whole
 * mechanism — the unique index does the work.
 */
export async function createJob(job: NewJob): Promise<JobRow> {
  const inserted = await query<JobRow>(
    `insert into preview_jobs
       (id, device_id, status, hairstyle_id, gender, hair_type, length_id, color_id,
        photo_width, photo_height, photo_key, idempotency_key)
     values ($1, $2, 'awaiting_upload', $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (device_id, idempotency_key) do nothing
     returning ${COLUMNS}`,
    [
      job.id,
      job.deviceId,
      job.hairstyleId,
      job.gender,
      job.hairType,
      job.lengthId,
      job.colorId,
      job.photoWidth,
      job.photoHeight,
      job.photoKey,
      job.idempotencyKey,
    ],
  );
  if (inserted[0]) return inserted[0];

  const existing = await query<JobRow>(
    `select ${COLUMNS} from preview_jobs where device_id = $1 and idempotency_key = $2`,
    [job.deviceId, job.idempotencyKey],
  );
  const row = existing[0];
  if (!row) throw new Error('job insert conflicted but the conflicting row could not be read');
  return row;
}

/** The client has finished its upload: the job may now be picked up. */
export async function markUploaded(id: string): Promise<JobRow | null> {
  const rows = await query<JobRow>(
    `update preview_jobs set status = 'queued', updated_at = now()
      where id = $1 and status = 'awaiting_upload'
      returning ${COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * How deep to look for a claimable job.
 *
 * Only relevant when the head of the queue is jobs whose device is already
 * generating. One device would need two hundred of its own queued to hide
 * everybody else's, which the app cannot produce — it submits one at a time —
 * and which a per-device quota will prevent outright.
 */
const CANDIDATE_WINDOW = 200;

/**
 * Takes one job off the queue, or returns null when there is nothing to take.
 *
 * ## Compare-and-set rather than `for update skip locked`
 *
 * The obvious shape for this is a locking select inside a CTE, and it was
 * written that way first. The guard here is simpler and strictly stronger: the
 * `UPDATE` carries `and status = 'queued'`, so two workers reaching for the same
 * row produce one winner and one zero-row result, whatever the isolation level
 * and without holding a lock across a round trip. The loser moves to the next
 * candidate instead of waiting behind a lock, which is what `skip locked` was
 * there to buy.
 *
 * It is also the version that runs on any Postgres, which matters more than it
 * sounds: `check-previews.mjs` exercises this exact query, and a queue whose
 * claim path cannot be tested is a queue with no test.
 *
 * ## One at a time
 *
 * Not a batch, and not laziness. The per-device cap has to see the claims this
 * same tick has already made — two jobs from one device selected in one batch
 * would both pass a check evaluated before either landed. A loop of single
 * claims gets that for free, because each one commits before the next one looks,
 * and the worker only ever fills the free slots, which is at most
 * `FAL_MAX_INFLIGHT`.
 */
export async function claimNext(leaseUntil: Date, maxPerDevice: number): Promise<JobRow | null> {
  const busy = new Map<string, number>();
  for (const row of await query<{ device_id: string; count: string }>(
    "select device_id, count(*) as count from preview_jobs where status = 'running' group by device_id",
  )) {
    busy.set(row.device_id, Number(row.count));
  }

  const candidates = await query<{ id: string; device_id: string }>(
    "select id, device_id from preview_jobs where status = 'queued' order by created_at limit $1",
    [CANDIDATE_WINDOW],
  );

  for (const candidate of candidates) {
    if ((busy.get(candidate.device_id) ?? 0) >= maxPerDevice) continue;

    const rows = await query<JobRow>(
      `update preview_jobs
          set status = 'running', attempts = attempts + 1, lease_until = $2, updated_at = now()
        where id = $1 and status = 'queued'
        returning ${COLUMNS}`,
      [candidate.id, leaseUntil],
    );
    // Zero rows means another worker got there first. Not an error, and not a
    // reason to stop: the next candidate is almost certainly free.
    if (rows[0]) return rows[0];
  }

  return null;
}

export interface Submitted {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  model: string;
  variant: VariantId | null;
  views: ViewAngle[];
  leaseUntil: Date;
}

/** Records what was actually sent, so any worker can collect the result. */
export async function markSubmitted(id: string, submitted: Submitted): Promise<void> {
  await query(
    `update preview_jobs
        set fal_request_id = $2, fal_status_url = $3, fal_response_url = $4, fal_model = $5,
            variant = $6, views = $7, submitted_at = now(), lease_until = $8, updated_at = now()
      where id = $1`,
    [
      id,
      submitted.requestId,
      submitted.statusUrl,
      submitted.responseUrl,
      submitted.model,
      submitted.variant,
      submitted.views,
      submitted.leaseUntil,
    ],
  );
}

/** Keeps a long generation from being re-claimed out from under its worker. */
export async function extendLease(id: string, leaseUntil: Date): Promise<void> {
  await query('update preview_jobs set lease_until = $2, updated_at = now() where id = $1', [id, leaseUntil]);
}

/**
 * The preview is in the bucket and the photograph is gone.
 *
 * Both halves in one statement on purpose: `photo_key = null` is not bookkeeping
 * that can be tidied later, it is the record that there is nothing left to
 * delete. A row that still names an object nobody intends to keep is how a
 * scrub quietly stops happening.
 */
export async function markReady(
  id: string,
  next: { resultKey: string; width: number | null; height: number | null; expiresAt: Date },
): Promise<void> {
  await withTransaction(async (tx) => {
    await tx(
      `update preview_jobs
          set status = 'ready', result_key = $2, result_width = $3, result_height = $4,
              expires_at = $5, photo_key = null, ready_at = now(), lease_until = null, updated_at = now()
        where id = $1`,
      [id, next.resultKey, next.width, next.height, next.expiresAt],
    );
    // The generation happened and it is the user's now: the hold becomes a
    // spend. In the same transaction, for the reason in `settle`'s header.
    await settle(tx, id, 'spent');
  });
}

export async function markFailed(id: string, error: string, code: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx(
      `update preview_jobs
          set status = 'failed', error = $2, error_code = $3,
              photo_key = null, lease_until = null, updated_at = now()
        where id = $1`,
      [id, error.slice(0, 500), code],
    );
    // A generation that failed is not a generation. Nobody pays for it.
    await settle(tx, id, 'refunded');
  });
}

/** Back to the queue for one more attempt — the photograph is still needed. */
export async function requeue(id: string, error: string, code: string): Promise<void> {
  await query(
    `update preview_jobs
        set status = 'queued', error = $2, error_code = $3, lease_until = null, updated_at = now()
      where id = $1`,
    [id, error.slice(0, 500), code],
  );
}

/** The device has the preview. Nothing of it remains here. */
export async function markCollected(id: string): Promise<void> {
  await query(
    `update preview_jobs
        set status = 'collected', result_key = null, expires_at = null, updated_at = now()
      where id = $1`,
    [id],
  );
}

export async function markCancelled(id: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx(
      `update preview_jobs
          set status = 'cancelled', photo_key = null, result_key = null,
              expires_at = null, lease_until = null, updated_at = now()
        where id = $1`,
      [id],
    );
    // Cancelling is free. The user may have cost us a generation at fal — see
    // the cancel route — but that is our bet on their behalf, not their bill.
    await settle(tx, id, 'refunded');
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getJob(id: string): Promise<JobRow | null> {
  const rows = await query<JobRow>(`select ${COLUMNS} from preview_jobs where id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * What this device still has any business knowing about.
 *
 * The exclusions are the interesting part, and getting them wrong is not
 * cosmetic. This used to return everything but `collected`, which meant a
 * *cancelled* job came back on every poll — and the app, finding an id it did
 * not recognise, adopted it as a fresh in-flight tile. Cancel, refresh, and the
 * thing you just cancelled was back at 5%, forever, because nothing was ever
 * going to move it. Terminal means terminal: `cancelled` and `collected` are
 * both over, and neither is something a client can act on.
 *
 * `failed` stays, and stays deliberately. A generation that fails while the app
 * is closed has to be tellable when it opens, or the tile the user was waiting
 * on simply vanishes. It leaves this list when they dismiss it, which cancels it.
 *
 * `awaiting_upload` stays too, for a subtler reason: the app's *own* in-flight
 * submit is in that state, and the client uses this list to decide which of its
 * local jobs the server still knows about. Withholding it would make the app
 * drop a job in the middle of uploading its photograph. What must not happen is
 * *adopting* an unknown one — see `reconcile()` on the client.
 */
export async function listJobs(deviceId: string, limit: number): Promise<JobRow[]> {
  return query<JobRow>(
    `select ${COLUMNS} from preview_jobs
      where device_id = $1 and status not in ('collected', 'cancelled')
      order by created_at desc
      limit $2`,
    [deviceId, limit],
  );
}

export async function countRunning(): Promise<number> {
  const rows = await query<{ count: string }>("select count(*) as count from preview_jobs where status = 'running'");
  return Number(rows[0]?.count ?? 0);
}

/** Every job currently at fal, so one tick can ask about all of them. */
export async function runningJobs(): Promise<JobRow[]> {
  return query<JobRow>(`select ${COLUMNS} from preview_jobs where status = 'running' order by created_at`);
}

/**
 * How many jobs are ahead of this one.
 *
 * Shown to the user, so it counts what they are actually waiting behind: every
 * job already running plus every queued job older than theirs. At ten
 * concurrency and roughly forty seconds a generation this is the only honest
 * thing the app can say about a wait that might be an hour long, and saying
 * nothing was worse.
 */
export async function queuePosition(job: JobRow): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*) as count from preview_jobs
      where status = 'running'
         or (status = 'queued' and created_at < $1)`,
    [job.created_at],
  );
  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Sweeping
// ---------------------------------------------------------------------------

/** Jobs whose worker died mid-generation: still at fal, nobody watching. */
export async function expiredLeases(now: Date): Promise<JobRow[]> {
  return query<JobRow>(
    `select ${COLUMNS} from preview_jobs
      where status = 'running' and lease_until is not null and lease_until < $1`,
    [now],
  );
}

/** Uploads that never arrived — the app was killed between the two calls. */
export async function abandonedUploads(before: Date): Promise<JobRow[]> {
  return query<JobRow>(
    `select ${COLUMNS} from preview_jobs
      where status = 'awaiting_upload' and created_at < $1`,
    [before],
  );
}

/** Results nobody came back for. Deleted whether or not anyone collected them. */
export async function expiredResults(now: Date): Promise<JobRow[]> {
  return query<JobRow>(
    `select ${COLUMNS} from preview_jobs
      where status = 'ready' and expires_at is not null and expires_at < $1`,
    [now],
  );
}

/**
 * Any row still naming an object after the job settled.
 *
 * Should always be empty — the transitions above null these columns as they go —
 * and is checked anyway, because "should always be empty" is exactly the class of
 * claim that stops being true six months after somebody adds a state.
 */
export async function unscrubbed(): Promise<JobRow[]> {
  return query<JobRow>(
    `select ${COLUMNS} from preview_jobs
      where status in ('failed', 'cancelled', 'collected')
        and (photo_key is not null or result_key is not null)`,
  );
}

export const leaseFor = (seconds = 300): Date => new Date(Date.now() + seconds * 1000);
export const retentionDeadline = (): Date =>
  new Date(Date.now() + env.previews.retentionDays * 24 * 60 * 60 * 1000);
