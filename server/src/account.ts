/**
 * The account and credit API.
 *
 * Seven routes, and one thing they all share: **the device header is the
 * authentication, for the account as well as for the device.** Signing in sets
 * `devices.user_id`, so a request that proves it is this phone also proves which
 * account it is signed into. There is no second token — see the header of
 * `accounts.ts` for why not.
 *
 * The one exception is the webhook, which is not the app at all. It carries
 * RevenueCat's shared secret and no device.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  adoptDevice,
  AuthError,
  deleteAccount,
  getAccount,
  identitiesFor,
  issueEmailCode,
  linkIdentity,
  normaliseEmail,
  PROVIDERS,
  upsertAccount,
  verifyIdentity,
  type Provider,
} from './accounts.js';
import { anchorsFrom, registerAnchors } from './anchors.js';
import { creditState, history, userForDevice } from './credits.js';
import { deviceIdFor, deviceSecretFrom, touchDevice } from './devices.js';
import { env } from './env.js';
import { applyWebhookEvent, creditProducts } from './purchases.js';

/**
 * The device behind a request, with its anchors registered.
 *
 * Registering the anchors *here* rather than in a dedicated call is what removes
 * an ordering bug: a freshly reinstalled Android phone would otherwise have to
 * remember to announce itself before its first generation, and any path that
 * forgot would hand out two more free previews. Every request that carries the
 * header registers what it carries.
 */
async function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const secret = deviceSecretFrom(request.headers.authorization);
  if (!secret) {
    reply.code(401).send({ error: 'device_required', message: 'send Authorization: Device <secret>' });
    return null;
  }
  const deviceId = deviceIdFor(secret);
  await touchDevice(deviceId);
  await registerAnchors(deviceId, anchorsFrom(deviceId, request.headers['x-install-anchor']));
  return deviceId;
}

const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);

/** Everything the app needs to draw Settings, in one request. */
async function state(deviceId: string) {
  const userId = await userForDevice(deviceId);
  const credits = await creditState(deviceId);
  const account = userId ? await getAccount(userId) : null;
  return {
    account: account ? { ...account, providers: await identitiesFor(userId!) } : null,
    credits,
    /** What the app must send RevenueCat as its app user id. Null until signed in. */
    purchaserId: userId,
  };
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Who this device is and what it may generate with.
   *
   * Called on launch and after anything that could have changed a balance. It is
   * also how the app discovers its own free allowance, which is why it works
   * perfectly well with no account — a signed-out device gets `account: null`
   * and a real number of free generations.
   */
  app.get('/v1/account', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    reply.header('Cache-Control', 'no-store');
    return state(deviceId);
  });

  /**
   * The balance on its own.
   *
   * Split from `/v1/account` because it is the one the paywall polls while it
   * waits for a webhook to land, and polling the whole account payload to watch
   * one integer change is a waste of both ends.
   */
  app.get('/v1/credits', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    reply.header('Cache-Control', 'no-store');
    return { credits: await creditState(deviceId), products: await creditProducts() };
  });

  /**
   * Sign in, and adopt this device.
   *
   * The same route for all three providers, because what differs between them is
   * only how the identity is proved. Apple and Google send an identity token;
   * email sends the six-digit code it was mailed.
   *
   * A device that is *already* signed into another account is simply moved. That
   * is the honest reading of "sign in as somebody else" and it costs nothing:
   * credits live on the account, so nothing follows the device across.
   */
  app.post('/v1/account/sign-in', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!isProvider(body.provider) || typeof body.token !== 'string') {
      reply.code(400);
      return { error: 'invalid_request', message: 'provider and token are required' };
    }

    try {
      const identity = await verifyIdentity({
        provider: body.provider,
        token: body.token,
        email: typeof body.email === 'string' ? body.email : null,
        displayName: typeof body.displayName === 'string' ? body.displayName.slice(0, 80) : null,
      });
      const { userId, created } = await upsertAccount(
        identity,
        typeof body.displayName === 'string' ? body.displayName.slice(0, 80) : null,
      );
      await adoptDevice(deviceId, userId);
      reply.code(created ? 201 : 200);
      return state(deviceId);
    } catch (error) {
      return authFailure(reply, error);
    }
  });

  /**
   * Mails a sign-in code.
   *
   * Answers the same way whether or not the address has an account, which is the
   * point: a different answer for a known address turns this into a way of
   * asking whether somebody uses Luvo.
   */
  app.post('/v1/account/email-code', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    const email = normaliseEmail((request.body as Record<string, unknown> | undefined)?.email);
    if (!email) {
      reply.code(400);
      return { error: 'invalid_email', message: 'that does not look like an email address' };
    }
    if (!env.auth.resendApiKey && !env.auth.emailDevEcho) {
      reply.code(503);
      return { error: 'email_unconfigured', message: 'this deployment cannot send email' };
    }

    const code = await issueEmailCode(email);
    if (env.auth.resendApiKey) {
      const sent = await sendCode(email, code);
      if (!sent) {
        reply.code(502);
        return { error: 'email_failed', message: 'the code could not be sent' };
      }
    }
    // Only ever in an explicitly opted-in development deployment — see
    // `emailDevEcho`, which refuses to be on at the same time as a mail provider.
    return { sent: true, ...(env.auth.emailDevEcho ? { devCode: code } : {}) };
  });

  /** Adds a second sign-in method to the account this device is already in. */
  app.post('/v1/account/link', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const userId = await userForDevice(deviceId);
    if (!userId) {
      reply.code(401);
      return { error: 'account_required', message: 'sign in first' };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!isProvider(body.provider) || typeof body.token !== 'string') {
      reply.code(400);
      return { error: 'invalid_request', message: 'provider and token are required' };
    }

    try {
      const identity = await verifyIdentity({
        provider: body.provider,
        token: body.token,
        email: typeof body.email === 'string' ? body.email : null,
      });
      await linkIdentity(userId, identity);
      return state(deviceId);
    } catch (error) {
      return authFailure(reply, error);
    }
  });

  /**
   * Sign out.
   *
   * One update and nothing else. The looks and favourites on the phone are files
   * that were never ours to clear, and the credits stay on the account waiting
   * for the next sign-in — which is the entire reason an account exists.
   */
  app.post('/v1/account/sign-out', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    await adoptDevice(deviceId, null);
    return state(deviceId);
  });

  /**
   * Delete the account, for real.
   *
   * Required in-app by App Store guideline 5.1.1(v), and required to be a
   * deletion rather than a deactivation. Unspent credits go with it and the app
   * says so before calling this — a confirmation that does not mention the
   * balance is a confirmation of the wrong thing.
   */
  app.delete('/v1/account', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const userId = await userForDevice(deviceId);
    if (!userId) {
      reply.code(401);
      return { error: 'account_required', message: 'no account on this device' };
    }
    await deleteAccount(userId);
    return state(deviceId);
  });

  /** The account's own credit history. */
  app.get('/v1/credits/history', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;
    const userId = await userForDevice(deviceId);
    if (!userId) return { history: [] };
    const rows = await history(userId, 50);
    reply.header('Cache-Control', 'no-store');
    return {
      history: rows.map((row) => ({
        kind: row.kind,
        source: row.source,
        delta: row.delta,
        reason: row.reason,
        at: new Date(row.created_at).getTime(),
      })),
    };
  });

  /**
   * RevenueCat's webhook. The only thing in this service that adds a credit.
   *
   * Answers 200 to everything it understands *and* to everything it has decided
   * not to act on, because RevenueCat retries a non-2xx for hours and a
   * subscription event we will never want is handled rather than failed. A wrong
   * secret is the one 401, and a genuine exception is the one 500 — that one
   * *should* be retried.
   */
  app.post('/v1/webhooks/revenuecat', async (request, reply) => {
    const secret = env.auth.revenueCatSecret;
    if (!secret) {
      reply.code(503);
      return { error: 'webhook_unconfigured', message: 'no REVENUECAT_WEBHOOK_SECRET' };
    }
    // RevenueCat sends whatever string is configured in its dashboard, so both
    // spellings are accepted rather than guessing which one was typed there.
    const header = request.headers.authorization ?? '';
    const presented = header.replace(/^Bearer\s+/i, '');
    if (presented !== secret) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const event = (request.body as { event?: Record<string, unknown> } | undefined)?.event;
    if (!event) {
      reply.code(400);
      return { error: 'invalid_request', message: 'no event' };
    }

    const outcome = await applyWebhookEvent(event);
    request.log.info({ outcome, type: event.type }, 'revenuecat webhook');
    return outcome;
  });
}

function authFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    reply.code(error.status);
    return { error: error.code, message: error.message };
  }
  throw error;
}

/**
 * Sends the sign-in code through Resend.
 *
 * Plain `fetch` rather than the SDK: it is one POST, and a dependency whose only
 * job is to build one JSON body is a dependency to keep updated for no reason.
 * Returns false rather than throwing — a mail provider being down is a 502 to
 * the user, not a 500 in our logs.
 */
async function sendCode(email: string, code: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.auth.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.auth.emailFrom,
        to: [email],
        subject: `${code} is your Luvo code`,
        text: `Your Luvo sign-in code is ${code}.\n\nIt expires in ${Math.round(
          env.auth.emailCodeTtlSeconds / 60,
        )} minutes. If you did not ask for it, you can ignore this email.`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
