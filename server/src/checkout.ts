/**
 * Buying credits on the web: two routes the browser calls, and one Stripe calls.
 *
 * The rule is the one `purchases.ts` opens with, unchanged by the change of
 * till: **the client never grants a credit.** The browser asks for a Checkout
 * Session and is sent to Stripe; Stripe takes the money and tells us. Nothing a
 * page says adds to a balance, and there is no code path here in which it could
 * — `grantStripeSession` is reached only from a signed webhook or from a session
 * this server has read back from Stripe itself.
 *
 * ## Why there are two ways in and not one
 *
 * The webhook is the authority. It is also, occasionally, two seconds slower
 * than the browser it is racing: Stripe redirects the payer back the instant the
 * payment succeeds, and the delivery arrives when it arrives. An app that
 * handles only the webhook shows somebody who has just paid their old balance
 * and a spinner, which is the exact moment to look most broken.
 *
 * So `POST /v1/checkout/confirm` exists for that gap. It is not a second
 * authority and it does not trust the browser: it takes a session id, **reads
 * the session from Stripe**, and grants only if Stripe says it was paid. The
 * browser's contribution is the timing, not the fact. Both paths write a
 * purchase row keyed on the PaymentIntent, so whichever arrives second is caught
 * by `purchases_transaction_idx` and grants nothing — which is why that index is
 * load-bearing rather than defensive.
 *
 * The alternative was to poll `/v1/credits` for a few seconds after the
 * redirect, which is what the phone does while it waits for RevenueCat. It works
 * and it is worse: it makes the wait as long as the delivery, and it cannot tell
 * "the webhook has not arrived yet" from "the payment failed".
 *
 * ## The return url is built here, from a path
 *
 * The browser sends `returnPath`, never a url. An open redirect is not a
 * theoretical concern on a payment flow — `success_url` is a link the payer is
 * sent to by Stripe, from Stripe's domain, immediately after entering card
 * details, which is as trustworthy a moment as a phishing page ever gets. A path
 * resolved against an origin this deployment configured cannot leave the site.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireDevice } from './account.js';
import { getAccount } from './accounts.js';
import { creditState, userForDevice } from './credits.js';
import { env } from './env.js';
import {
  applyStripeEvent,
  grantStripeSession,
  purchaseFor,
  stripePriceIdFor,
  creditsForProduct,
} from './purchases.js';
import {
  createCheckoutSession,
  paymentDocument,
  readSessionObject,
  retrieveSession,
  stripeConfigured,
  StripeError,
  verifyWebhookSignature,
} from './stripe.js';

/**
 * Where a finished checkout comes back to.
 *
 * Precedence, and the reason for each step: an explicitly configured origin
 * first, because a deployment that has said where its site is has answered this;
 * then `SHARE_BASE_URL`, which is the same answer given for a different reason;
 * then the browser's own `Origin`, which is set by the browser rather than by
 * page script and — since creating a session already requires this device's
 * secret — can only ever send the caller back to a site of their own choosing
 * with their own session id. That last step is what lets a local checkout work
 * with nothing configured.
 */
function returnOrigin(request: FastifyRequest): string | null {
  if (env.stripe.returnUrl) return env.stripe.returnUrl;
  const origin = request.headers.origin;
  return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin.replace(/\/$/, '') : null;
}

/**
 * A path the site can be returned to, or the account page.
 *
 * `//evil.example` is a protocol-relative url that a browser follows off-site,
 * and it starts with a slash — so "begins with `/`" is not the check. Anything
 * that is not a single leading slash followed by a non-slash is refused outright
 * rather than sanitised, because a half-cleaned redirect target is the kind of
 * thing that is fixed twice and wrong once.
 */
function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/(?!\/)[^\s]*$/.test(value) || value.length > 512) return '/account';
  return value;
}

/** `?checkout=success` and friends, appended to whatever the path already carries. */
function withParams(origin: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, `${origin}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // Stripe substitutes this token itself, and it must survive encoding — which
  // `URLSearchParams` would otherwise turn into %7BCHECKOUT_SESSION_ID%7D.
  return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Starts a purchase. Answers with a url to send the browser to.
   *
   * An account is required and the refusal says so rather than 500ing on a null:
   * credits live on an account, which is the whole reason accounts exist here,
   * and buying them anonymously would mean buying something into a browser's
   * `localStorage` — where clearing site data is a refund nobody gets.
   */
  app.post('/v1/checkout/session', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    if (!stripeConfigured()) {
      reply.code(503);
      return { error: 'checkout_unconfigured', message: 'this deployment has no payment provider configured' };
    }

    const userId = await userForDevice(deviceId);
    if (!userId) {
      reply.code(401);
      return { error: 'account_required', message: 'sign in first — purchased credits live on an account' };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const productId = typeof body.productId === 'string' ? body.productId : '';
    const credits = await creditsForProduct(productId);
    if (!credits) {
      reply.code(400);
      return { error: 'unknown_product', message: `no published pack "${productId}"` };
    }

    const priceId = await stripePriceIdFor(productId);
    if (!priceId) {
      // A pack that exists in our catalogue and has no Price pointed at it. The
      // site already draws it as "price not set yet" and hides its button; this
      // is the same fact refused at the door for anyone who got past that.
      reply.code(503);
      return { error: 'product_unpriced', message: `"${productId}" has no Stripe price yet` };
    }

    const origin = returnOrigin(request);
    if (!origin) {
      reply.code(503);
      return {
        error: 'checkout_return_unconfigured',
        message: 'set CHECKOUT_RETURN_URL — there is nowhere to send the browser back to',
      };
    }

    const path = safeReturnPath(body.returnPath);
    // The address the account signed in with, prefilled on Stripe's page.
    //
    // It is read from `users` rather than taken from the request, for the same
    // reason `client_reference_id` is: the browser's claim about who it is does
    // not survive this call. An account with no address on it — Apple with the
    // email hidden, a Clerk token carrying no claim — sends no field at all and
    // Stripe asks, which is the honest degradation rather than a guess.
    //
    // Stripe makes a prefilled address read-only, and that is the intended
    // behaviour here: the receipt should reach the inbox the credits are held
    // against, not one typed once at a till.
    const email = (await getAccount(userId))?.email ?? null;
    try {
      const session = await createCheckoutSession({
        priceId,
        userId,
        productId,
        credits,
        email,
        successUrl: withParams(origin, path, { checkout: 'success', session_id: '{CHECKOUT_SESSION_ID}' }),
        cancelUrl: withParams(origin, path, { checkout: 'cancelled' }),
      });
      if (!session.url) {
        reply.code(502);
        return { error: 'checkout_failed', message: 'stripe returned a session with no url' };
      }
      reply.header('Cache-Control', 'no-store');
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      return stripeFailure(reply, error);
    }
  });

  /**
   * The browser, back from Stripe, asking whether that worked.
   *
   * Two checks before anything is granted, and they are different checks:
   * Stripe says whether the session was **paid**, and this server says whether
   * it belongs to the account on **this device**. Without the second, a session
   * id — which is in a URL bar, in browser history, and in whatever the visitor
   * pasted it into — would be a bearer token for somebody else's credits. It
   * would not grant them twice, but it would decide *when* and to whom the
   * confirmation was reported, and a purchase route that answers about another
   * account's money is not a route worth having.
   */
  app.post('/v1/checkout/confirm', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    if (!stripeConfigured()) {
      reply.code(503);
      return { error: 'checkout_unconfigured', message: 'this deployment has no payment provider configured' };
    }

    const sessionId = (request.body as Record<string, unknown> | undefined)?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      reply.code(400);
      return { error: 'invalid_request', message: 'sessionId is required' };
    }

    const userId = await userForDevice(deviceId);
    if (!userId) {
      reply.code(401);
      return { error: 'account_required', message: 'sign in first' };
    }

    try {
      const session = await retrieveSession(sessionId);
      if ((session.clientReferenceId ?? session.metadata.userId) !== userId) {
        // Deliberately the same answer somebody would get for a session id that
        // does not exist: a different one here would turn this route into a way
        // of asking whether a given session belongs to somebody else.
        reply.code(404);
        return { error: 'not_found', message: 'no such checkout on this account' };
      }

      const outcome = await grantStripeSession(session, { origin: 'confirm' });
      reply.header('Cache-Control', 'no-store');
      return {
        // `granted` is a first arrival, `duplicate` is the webhook having beaten
        // us to it, and both mean the credits are on the account — which is what
        // the page is actually asking. Reported separately anyway, because
        // "already applied" is worth being able to see in a log.
        paid: session.paymentStatus === 'paid',
        applied: outcome.applied,
        /**
         * How many previews *this purchase* was worth, which is not derivable
         * from anything else in this reply.
         *
         * The browser wants to say "+5" and then roll the balance up to it, and
         * the only two numbers it otherwise has are the balance now and whatever
         * it happened to be showing beforehand — which is not the same thing: on
         * a return from Stripe the page is a fresh load, so the first balance it
         * ever read may already include the pack. Subtracting one from the other
         * would give zero exactly when the webhook was fast, which is most of the
         * time.
         *
         * Looked up from `credit_products` rather than read off the session's
         * metadata, for the same reason `grantStripeSession` looks it up: the
         * metadata is Stripe's copy and this table is the row this service owns.
         * `outcome.credits` would do for a first arrival and is absent on a
         * `duplicate`, which is the common case, so it is not the source.
         *
         * Zero rather than null when the session bought nothing we recognise —
         * an unpaid session, an unknown product — so the client can say "no
         * previews were added" without having to decide what a null means.
         */
        purchased:
          session.paymentStatus === 'paid'
            ? (await creditsForProduct(session.metadata.productId ?? '')) ?? 0
            : 0,
        credits: await creditState(deviceId),
      };
    } catch (error) {
      return stripeFailure(reply, error);
    }
  });

  invoiceRoute(app);
}

/**
 * Adds the invoice route to the checkout plugin.
 *
 * It lives here rather than beside `GET /v1/purchases` in `account.ts` because
 * it is a *Stripe* call and that file makes none — the history is read out of
 * our own table and answers on a deployment with no key at all, which is the
 * property worth protecting. A page that lists three payments and cannot
 * produce a document for one of them is degraded; a page that cannot list them
 * is broken.
 */
function invoiceRoute(app: FastifyInstance): void {
  /**
   * The document for one payment, fetched from Stripe at the moment it is asked
   * for and never stored.
   *
   * Answers with a url rather than the bytes, and that is the whole design: the
   * PDF is served by Stripe, from Stripe's domain, over a link Stripe controls
   * the lifetime of. Proxying it would mean this process streaming somebody's
   * invoice through itself for no gain, and caching the link would mean handing
   * out an address that had expired since it was written down.
   */
  app.get('/v1/purchases/:id/invoice', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    const userId = await userForDevice(deviceId);
    if (!userId) {
      reply.code(401);
      return { error: 'account_required', message: 'sign in first' };
    }

    const { id } = request.params as { id: string };
    const purchase = await purchaseFor(userId, id);
    // The same answer as a purchase id that does not exist, for the reason
    // `/v1/checkout/confirm` gives: a different one would turn this into a way
    // of asking whether a given id belongs to somebody else.
    if (!purchase) {
      reply.code(404);
      return { error: 'not_found', message: 'no such purchase on this account' };
    }

    if (purchase.store !== 'stripe') {
      // An App Store or Play purchase, which is real and is not ours to
      // document — the receipt is in the buyer's own store account. Said as that
      // rather than as a failure, and `documented: false` on the row means the
      // interface should not have offered the button in the first place.
      reply.code(409);
      return {
        error: 'store_purchase',
        message: 'this was bought through an app store — its receipt is in your store account',
      };
    }

    if (!stripeConfigured()) {
      reply.code(503);
      return { error: 'checkout_unconfigured', message: 'this deployment has no payment provider configured' };
    }

    try {
      const document = await paymentDocument(purchase.transactionId);
      if (!document) {
        reply.code(404);
        return { error: 'no_document', message: 'stripe has no invoice or receipt for that payment' };
      }
      reply.header('Cache-Control', 'no-store');
      return document;
    } catch (error) {
      return stripeFailure(reply, error);
    }
  });
}

/**
 * The webhook, in its own plugin because of one line.
 *
 * A Stripe signature is computed over the **exact bytes** of the delivery, and
 * `JSON.parse` followed by `JSON.stringify` does not reproduce them — key order,
 * unicode escapes and number formatting all move. So this scope replaces
 * Fastify's JSON parser with one that hands over the Buffer, and encapsulation
 * is what keeps that from reaching `/v1/account/sign-in`, which very much wants
 * its body parsed.
 *
 * Registering it as a separate plugin rather than adding a route to
 * `checkoutRoutes` is the whole mechanism. It is not stylistic: a content-type
 * parser added inside a plugin applies to that plugin and its children, and to
 * nothing else.
 */
export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.post('/v1/webhooks/stripe', async (request, reply) => {
    const secret = env.stripe.webhookSecret;
    if (!secret) {
      reply.code(503);
      return { error: 'webhook_unconfigured', message: 'no STRIPE_WEBHOOK_SECRET' };
    }

    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ''));

    let event;
    try {
      event = verifyWebhookSignature(raw, request.headers['stripe-signature'] as string | undefined, secret);
    } catch (error) {
      // A bad signature is a 400 and never a 500, because a 500 is a retry
      // instruction and a payload that did not come from Stripe will not start
      // having come from Stripe on the third attempt.
      request.log.warn({ err: error }, 'stripe webhook rejected');
      return stripeFailure(reply, error);
    }

    /**
     * Everything understood answers 200, including the events acted on and the
     * events deliberately ignored. Stripe disables an endpoint that fails often
     * enough, so answering non-2xx to `payment_intent.created` — which arrives
     * for every single purchase — is a way to lose the deliveries that matter.
     *
     * A genuine exception is the one 500, and it *should* be retried: a database
     * that was briefly unreachable is exactly the case Stripe's retry schedule
     * exists for.
     */
    const outcome = await applyStripeEvent(event, readSessionObject);
    request.log.info({ outcome, type: event.type, event: event.id }, 'stripe webhook');
    return outcome;
  });
}

function stripeFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof StripeError) {
    reply.code(error.status >= 400 && error.status < 600 ? error.status : 502);
    return { error: error.code, message: error.message };
  }
  throw error;
}
