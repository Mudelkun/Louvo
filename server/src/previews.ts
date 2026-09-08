/**
 * The preview API: submit a generation, ask how it is going, collect it, and
 * then it is gone from here.
 *
 * Five routes and one property worth stating before any of them: **no image
 * bytes pass through this process.** The photograph goes from the phone straight
 * to a private bucket on a url this endpoint signed; the finished preview comes
 * back on a url this endpoint signed. What the API handles is small JSON, which
 * is why fifteen hundred simultaneous submissions are fifteen hundred rows and
 * fifteen hundred HMACs rather than four gigabytes through a Node process.
 *
 * The other property is the one the whole design is for. `POST /:id/collected`
 * is not a courtesy — it is the delete. A device that has downloaded its preview
 * says so, the object is removed, the column that named it is nulled, and the
 * only remaining copy of that image is on the phone that asked for it. Everything
 * else here is arranged so that call is the normal path rather than the tidy one.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { claimAnonymous, releaseAnonymous, reportIfSuspicious } from './abuse.js';
import { anchorsFrom, registerAnchors } from './anchors.js';
import { getCatalog } from './catalog.js';
import { attachCharge, creditState, reserve, userForDevice } from './credits.js';
import { deviceIdFor, deviceKindFor, deviceSecretFrom, sameDevice, setPushToken, touchDevice } from './devices.js';
import { env } from './env.js';
import { cancel as cancelGeneration } from './fal.js';
import {
  createJob,
  getJob,
  listJobs,
  markCancelled,
  markCollected,
  markUploaded,
  newJobId,
  photoKey,
  queuePosition,
  type JobRow,
} from './jobs.js';
import { storage } from './storage.js';
import { GENDERS, HAIR_LENGTH_IDS, HAIR_TYPE_IDS, type Gender, type HairLengthId, type HairTypeId } from './types.js';

/**
 * How far along, in the only terms this process actually knows.
 *
 * Three stages, matching `GENERATION_STEPS` in the app, and every one of them is
 * a fact about the job rather than a number invented to make a bar move: waiting
 * for a slot, at the model, done. The easing between them belongs to the client,
 * which already does it (`STAGE_RANGE` in `src/api/client.ts`) — a server that
 * sent a smoothly climbing percentage would be inventing progress, which is the
 * one thing `app/try/generating.tsx` is written not to do.
 */
export type PreviewStage = 'prepare' | 'apply' | 'finalize';

const STAGE: Record<JobRow['status'], PreviewStage> = {
  awaiting_upload: 'prepare',
  queued: 'prepare',
  running: 'apply',
  ready: 'finalize',
  collected: 'finalize',
  failed: 'apply',
  cancelled: 'prepare',
};

interface PreviewView {
  id: string;
  status: JobRow['status'];
  stage: PreviewStage;
  hairstyleId: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId: HairLengthId | null;
  variant: string | null;
  views: string[];
  createdAt: number;
  /**
   * Which pot paid for this generation, so the app can say so.
   *
   * Reported rather than inferred, and it is the same honesty rule the rest of
   * this service runs on: the result screen tells somebody they have used one of
   * their two free previews because the server said that is what happened, not
   * because the client counted.
   */
  chargeSource?: 'free' | 'paid';
  /** How many generations are ahead of this one. Only while it is waiting. */
  queuePosition?: number;
  error?: string;
  errorCode?: string;
  result?: { url: string; width: number | null; height: number | null; expiresAt: number };
}

function view(job: JobRow, extras: Partial<PreviewView> = {}): PreviewView {
  return {
    id: job.id,
    status: job.status,
    stage: STAGE[job.status],
    hairstyleId: job.hairstyle_id,
    gender: job.gender,
    hairType: job.hair_type,
    lengthId: job.length_id,
    variant: job.variant,
    views: job.views ?? [],
    createdAt: job.created_at.getTime(),
    ...(job.charge_source ? { chargeSource: job.charge_source } : {}),
    ...(job.error ? { error: job.error } : {}),
    ...(job.error_code ? { errorCode: job.error_code } : {}),
    ...extras,
  };
}

/**
 * The result url, minted per request and never stored.
 *
 * Signed for minutes, so a url that leaks out of a log or a screenshot is not a
 * standing grant to somebody's face. The app asks again if it needs another.
 */
function withResult(job: JobRow, extras: Partial<PreviewView> = {}): PreviewView {
  if (job.status !== 'ready' || !job.result_key || !storage) return view(job, extras);
  return view(job, {
    ...extras,
    result: {
      url: storage.presignGet(job.result_key, env.previews.downloadTtlSeconds),
      width: job.result_width,
      height: job.result_height,
      expiresAt: (job.expires_at ?? new Date()).getTime(),
    },
  });
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

const isGender = (value: unknown): value is Gender => GENDERS.includes(value as Gender);
const isHairType = (value: unknown): value is HairTypeId => HAIR_TYPE_IDS.includes(value as HairTypeId);
const isLength = (value: unknown): value is HairLengthId => HAIR_LENGTH_IDS.includes(value as HairLengthId);

function dimension(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number > 0 && number <= 20_000 ? Math.round(number) : null;
}

/**
 * The device behind a request, registering it if this is the first time.
 *
 * Replies 401 and returns null when there is no usable secret. Every route here
 * needs a device, so the alternative — a decorator or a preHandler hook — would
 * hide the one line that matters in a plugin registration.
 */
async function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const secret = deviceSecretFrom(request.headers.authorization);
  if (!secret) {
    reply.code(401).send({ error: 'device_required', message: 'send Authorization: Device <secret>' });
    return null;
  }
  const deviceId = deviceIdFor(secret);
  await touchDevice(deviceId);
  return deviceId;
}

/**
 * The same, plus this device's install anchors.
 *
 * Split from `requireDevice` on purpose, and the reason is throughput rather
 * than tidiness. Registering an anchor is three upserts, and `GET
 * /v1/previews/:id` is polled every two seconds by every phone watching a
 * generation — putting it on the shared helper meant six writes a second per
 * waiting user to re-learn something that had not changed.
 *
 * Only one route here needs it, and it needs it for a specific reason: the
 * credit pre-check reads the allowance through `anchorsForDevice`, so a device
 * whose anchors had never been registered would look like it had none left and
 * be refused its very first free generation.
 */
/**
 * Which kind of client this is, for the anchor the device secret is filed under.
 *
 * Resolved through one helper so the submit route's two calls — registering the
 * anchors and then reserving against them — cannot disagree. A device registered
 * as `web` and reserved against as `device` would hold against an anchor that
 * does not exist, which fails open.
 */
const kindOf = (request: FastifyRequest) =>
  deviceKindFor(request.headers.origin, request.headers['x-luvo-client']);

async function requireAnchoredDevice(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const deviceId = await requireDevice(request, reply);
  if (!deviceId) return null;
  await registerAnchors(deviceId, anchorsFrom(deviceId, request.headers['x-install-anchor'], kindOf(request)));
  return deviceId;
}

/** A job this device is allowed to see, or the right refusal. */
async function requireJob(id: string, deviceId: string, reply: FastifyReply): Promise<JobRow | null> {
  const job = await getJob(id);
  // 404 rather than 403 when it belongs to somebody else: a distinguishable
  // "exists but is not yours" turns job ids into an enumerable list of what
  // other people are generating.
  if (!job || !sameDevice(job.device_id, deviceId)) {
    reply.code(404).send({ error: 'not_found', message: `no preview "${id}"` });
    return null;
  }
  return job;
}

/** Whether this deployment can generate at all. */
function configured(reply: FastifyReply): boolean {
  if (storage && env.previews.falKey) return true;
  reply.code(503).send({
    error: 'previews_unconfigured',
    message: 'this deployment has no generator key or transient bucket',
  });
  return false;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function previewRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Starts a preview.
   *
   * Returns before anything has been generated and before the photograph has
   * even been sent: the response is a job id and a url to PUT the photo to. Two
   * calls rather than one multipart upload is what keeps the image off this
   * process, and it is also what lets the phone retry the upload — the expensive,
   * flaky half — without re-creating the job or risking a second charge.
   */
  app.post('/v1/previews', async (request, reply) => {
    if (!configured(reply)) return;
    // The one route that registers anchors — see `requireAnchoredDevice`.
    const deviceId = await requireAnchoredDevice(request, reply);
    if (!deviceId) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const hairstyleId = typeof body.hairstyleId === 'string' ? body.hairstyleId : null;
    const gender = body.gender;

    if (!hairstyleId || !isGender(gender)) {
      reply.code(400);
      return { error: 'invalid_request', message: 'hairstyleId and gender are required' };
    }

    // Checked against the live catalog before a job exists, so an unknown style
    // is a 400 the app can show rather than a job that fails an hour later.
    const catalog = await getCatalog();
    if (!catalog.hairstyles.some((style) => style.id === hairstyleId)) {
      reply.code(404);
      return { error: 'not_found', message: `no hairstyle "${hairstyleId}"` };
    }

    /**
     * The credit gate, and it is deliberately two checks rather than one.
     *
     * This first one exists for the user: it refuses before a job row is
     * created, so somebody with no credits gets a paywall rather than a job that
     * appears and is instantly cancelled. It is *not* the guard — it reads a
     * balance and then acts on it, which is a race by construction.
     *
     * The guard is `reserve()` below, which moves the balance with the same
     * compare-and-set the queue claims jobs with. Two taps on Generate cannot
     * both pass it, whatever the timing.
     */
    if (env.credits.enforced) {
      const available = await creditState(deviceId);
      if (available.total <= 0) {
        reply.code(402);
        return {
          error: 'insufficient_credits',
          message: 'no generations left',
          credits: available,
        };
      }
    }

    /**
     * The anonymous ceiling.
     *
     * Applied only to a signed-out browser, and both halves of that matter. A
     * signed-in device has an account, and the account is the identity — rate
     * limiting somebody who has told us who they are would be punishing the
     * behaviour this whole design is trying to produce. A phone is exempt because
     * its anchor is keystore-backed and already survives the thing this defends
     * against; `abuse.ts` has the asymmetry in full.
     *
     * It is checked *before* the job exists and released if the charge below
     * fails, so a lost race for the last credit does not also consume somebody's
     * anonymous allowance for the day.
     *
     * The refusal is deliberately not `insufficient_credits`. Nothing here says
     * the user is out of credits — it says this network has had its anonymous
     * share — and the interface answers it with a sign-in, which is free and
     * grants a credit. Conflating the two would put a paywall in front of
     * somebody who has never been asked for an email.
     */
    let anonymous: Awaited<ReturnType<typeof claimAnonymous>> | null = null;
    if (env.credits.enforced && kindOf(request) === 'web' && !(await userForDevice(deviceId))) {
      anonymous = await claimAnonymous(
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          language: request.headers['accept-language'],
        },
        deviceId,
      );
      // Never awaited into the response and never allowed to throw: an alert
      // that can fail a generation is worse than no alert. See its header.
      void reportIfSuspicious(anonymous).catch((error) =>
        request.log.warn({ err: error }, 'abuse alert failed'),
      );

      if (!anonymous.allowed) {
        reply.code(429);
        return {
          error: 'anon_limit_reached',
          message: 'sign in to keep generating — it is free, and it adds a credit',
          credits: await creditState(deviceId),
        };
      }
    }

    const id = newJobId();
    const key = photoKey(id);
    const job = await createJob({
      id,
      deviceId,
      hairstyleId,
      gender,
      hairType: isHairType(body.hairType) ? body.hairType : null,
      lengthId: isLength(body.lengthId) ? body.lengthId : null,
      colorId: typeof body.colorId === 'string' ? body.colorId : null,
      photoWidth: dimension(body.photoWidth),
      photoHeight: dimension(body.photoHeight),
      photoKey: key,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 100) : null,
    });

    /**
     * Charge, but only for a job this request actually created.
     *
     * `createJob` is idempotent: a retried POST returns the job the first one
     * made. Reserving unconditionally would turn a dropped response — the exact
     * situation the idempotency key exists for — into a second credit spent on a
     * generation that already happened. So the charge follows the same test the
     * status code does.
     */
    let charged = job;
    if (job.id === id && env.credits.enforced) {
      const charge = await reserve(
        deviceId,
        anchorsFrom(deviceId, request.headers['x-install-anchor'], kindOf(request)),
      );
      if (!charge) {
        // Lost the race for the last credit between the check above and here.
        // Cancelling releases the (unwritten) charge as a no-op and leaves no
        // job for the app to poll.
        await markCancelled(job.id);
        // And give back the anonymous claim, which paid for a generation that
        // never happened. Without this, two racing submissions cost the bucket
        // two of its daily three and produce one preview.
        if (anonymous) await releaseAnonymous(anonymous.bucketId);
        reply.code(402);
        return {
          error: 'insufficient_credits',
          message: 'no generations left',
          credits: await creditState(deviceId),
        };
      }
      await attachCharge(job.id, charge);
      charged = { ...job, charge_source: charge.source };
    }

    reply.code(job.id === id ? 201 : 200);
    return {
      job: view(charged),
      credits: await creditState(deviceId),
      // Absent once the job has moved on: a replayed submit for a job already
      // generating must not hand out a second write url for its photograph.
      upload:
        job.status === 'awaiting_upload' && job.photo_key
          ? {
              method: 'PUT',
              url: storage!.presignPut(job.photo_key, env.previews.uploadTtlSeconds),
              expiresIn: env.previews.uploadTtlSeconds,
              maxBytes: env.previews.maxUploadBytes,
            }
          : null,
    };
  });

  /**
   * The photograph is uploaded; queue the job.
   *
   * The object is checked rather than trusted. A client that reports success on
   * a failed PUT would otherwise occupy one of ten concurrency slots for forty
   * seconds to have fal tell us the image url 404s, and the user would be
   * charged for the privilege.
   */
  app.post<{ Params: { id: string } }>('/v1/previews/:id/ready', async (request, reply) => {
    if (!configured(reply)) return;
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const job = await requireJob(request.params.id, deviceId, reply);
    if (!job) return;

    if (job.status !== 'awaiting_upload') return { job: withResult(job) };
    if (!job.photo_key) {
      reply.code(409);
      return { error: 'photo_scrubbed', message: 'this job no longer has a photograph' };
    }

    const object = await storage!.head(job.photo_key);
    if (!object) {
      reply.code(409);
      return { error: 'photo_missing', message: 'the upload did not arrive' };
    }
    if (object.bytes > env.previews.maxUploadBytes) {
      await storage!.remove(job.photo_key);
      await markCancelled(job.id);
      reply.code(413);
      return { error: 'photo_too_large', message: `the photograph exceeds ${env.previews.maxUploadBytes} bytes` };
    }

    const queued = (await markUploaded(job.id)) ?? job;
    return { job: view(queued, { queuePosition: await queuePosition(queued) }) };
  });

  /** Everything this device has in flight, plus anything waiting to be collected. */
  app.get('/v1/previews', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const raw = Number.parseInt(String((request.query as Record<string, unknown>).limit ?? ''), 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 50) : 20;
    const jobs = await listJobs(deviceId, limit);
    return { previews: jobs.map((job) => withResult(job)) };
  });

  app.get<{ Params: { id: string } }>('/v1/previews/:id', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const job = await requireJob(request.params.id, deviceId, reply);
    if (!job) return;

    // Only computed while it means something. A finished job's "position" is a
    // number that would read as a queue it is not in.
    const extras = job.status === 'queued' ? { queuePosition: await queuePosition(job) } : {};
    // Never cached: this is the one endpoint whose answer changes every few
    // seconds, and a proxy holding it for even sixty would stall the wait screen.
    reply.header('Cache-Control', 'no-store');
    return { job: withResult(job, extras) };
  });

  /**
   * The device has the preview. Delete ours.
   *
   * The most important route here, and the reason the app downloads before it
   * acknowledges rather than after. Once this returns there is no copy of that
   * image on any machine of ours and the row cannot even say what its key was.
   *
   * Idempotent, because the app will call it again after a dropped response and
   * "already deleted" is the outcome it wanted.
   */
  app.post<{ Params: { id: string } }>('/v1/previews/:id/collected', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const job = await requireJob(request.params.id, deviceId, reply);
    if (!job) return;

    if (job.result_key && storage) await storage.remove(job.result_key);
    if (job.status === 'ready') await markCollected(job.id);
    return { job: view({ ...job, status: 'collected', result_key: null }) };
  });

  /**
   * Cancel — and mean it.
   *
   * Three things happen, and the first is the one that used to be missing: if the
   * generation is already at fal, fal is asked to stop it. A job still in its
   * queue is genuinely killed and never billed; one already rendering usually
   * cannot be, and that is a fact about the model rather than about this request.
   * Either way the outcome is honest, which is why nothing here reports "stopped"
   * as though it were guaranteed.
   *
   * Then the photograph and any result are deleted, immediately, and the row is
   * moved to `cancelled` — which is also what makes the worker throw the image
   * away if it does arrive (`collect()` re-reads the row before writing). What the
   * user asked for was to stop waiting and to stop us holding their picture; both
   * happen here regardless of what fal manages.
   *
   * fal is called from the API rather than left to the worker on purpose: a
   * person is waiting for this response, and a cancel that takes effect on the
   * next two-second tick is a cancel that races the thing it is cancelling.
   */
  app.delete<{ Params: { id: string } }>('/v1/previews/:id', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const job = await requireJob(request.params.id, deviceId, reply);
    if (!job) return;

    if (job.status === 'running' && job.fal_status_url && env.previews.falKey) {
      // Best effort by design — `cancelGeneration` swallows its own failures.
      // A generation that cannot be cancelled finishes, and its result is
      // discarded on arrival rather than written to the bucket.
      await cancelGeneration(job.fal_status_url, env.previews.falKey);
      request.log.info({ job: job.id }, 'asked fal to cancel');
    }

    if (storage) {
      if (job.photo_key) await storage.remove(job.photo_key);
      if (job.result_key) await storage.remove(job.result_key);
    }
    await markCancelled(job.id);
    return { job: view({ ...job, status: 'cancelled', photo_key: null, result_key: null }) };
  });

  /**
   * Where to send the notification.
   *
   * An Expo push token, which is what makes a preview finishing reach a phone
   * whose owner has closed the app — the whole reason generation moved off the
   * device. Sending `null` unregisters, which is what the app does when the user
   * revokes the permission.
   */
  app.post('/v1/devices/push', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : null;
    const platform = typeof body.platform === 'string' ? body.platform.slice(0, 16) : null;
    if (token && !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
      reply.code(400);
      return { error: 'invalid_token', message: 'not an Expo push token' };
    }
    await setPushToken(deviceId, { token, platform });
    return { registered: !!token };
  });
}
