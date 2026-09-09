/**
 * Stripe, as three things: a form encoder, a signature check, and four calls.
 *
 * ## Why there is no SDK here
 *
 * The same argument `mail.ts` makes about Resend, reached at a larger size.
 * What this service actually needs from Stripe is: create a Checkout Session,
 * read one back, read a Price, and verify an HMAC on an incoming webhook. That
 * is four HTTPS calls with `application/x-www-form-urlencoded` bodies and about
 * twenty lines of `crypto`. The SDK brings a version-pinned type surface for an
 * API of several hundred objects, a retry policy, a telemetry header and its own
 * HTTP client, all of it to be kept updated on behalf of four calls.
 *
 * This codebase already hand-rolls the harder version of exactly this — SigV4
 * presigning in `storage.ts`, JWKS verification in `accounts.ts`, Expo's push
 * API in `push.ts` — and the reason is the same each time: a dependency whose
 * job is to build one body is a dependency to keep updated for nothing.
 *
 * The one place that judgement would flip is Stripe Elements or any flow where
 * card data touches our code. It never does here. **Checkout is hosted**: the
 * visitor leaves for Stripe's own page, so no card number, no PAN, no CVC and no
 * publishable key ever exist in Louvo's browser bundle, and our PCI surface is
 * SAQ A. That is also why the web has no `NEXT_PUBLIC_STRIPE_*` key at all —
 * there is nothing on the client for it to configure.
 *
 * ## The signature is the security model
 *
 * `POST /v1/webhooks/stripe` is a public endpoint that adds credits, so it is
 * exactly as trustworthy as the check in `verifyWebhookSignature`. Three things
 * that check must do and does:
 *
 * - **Verify against the raw bytes.** `JSON.parse` then `JSON.stringify` is not
 *   the same string — key order, unicode escapes and number formatting all move
 *   — so the body is parsed as a Buffer for this route and only this route. See
 *   the content-type parser in `checkout.ts`.
 * - **Compare in constant time.** `timingSafeEqual`, on equal-length buffers,
 *   because a `===` on a hex digest leaks it a nibble at a time to anyone
 *   willing to measure.
 * - **Reject an old timestamp.** A signature stays valid forever; the timestamp
 *   is what stops a captured delivery being replayed months later. Five minutes,
 *   which is Stripe's own default tolerance.
 *
 * Idempotency is *not* part of this file: a legitimately retried delivery is
 * signed correctly and must be accepted here, then found to be a duplicate by
 * the unique indexes in `005_credits.sql`. Those are two different jobs and
 * conflating them is how a retry becomes a lost purchase.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from './env.js';

export interface StripePrice {
  id: string;
  /** Minor units. Never stored — see `007_stripe.sql`. */
  amount: number;
  currency: string;
}

export interface StripeSession {
  id: string;
  url: string | null;
  /** `paid`, `unpaid` or `no_payment_required`. Only the first grants. */
  paymentStatus: string;
  status: string;
  /** Our user id, set at creation. The identity a grant is made against. */
  clientReferenceId: string | null;
  metadata: Record<string, string>;
  /** Stripe's identity for the money. What `purchases.store_transaction_id` holds. */
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  customerEmail: string | null;
}

/** Whether this deployment can charge anybody at all. */
export const stripeConfigured = (): boolean => !!env.stripe.secretKey;

/** Whether it can be told that somebody was charged. */
export const stripeWebhookConfigured = (): boolean => !!env.stripe.webhookSecret;

export class StripeError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/**
 * Stripe's form encoding, which is not `URLSearchParams` on a flat object.
 *
 * Nested values are expressed in the *key*: `line_items[0][price]=price_123`,
 * `metadata[userId]=usr_abc`. This walks a plain object into that shape, which
 * is the whole of what the SDK's serialiser does for the bodies used here.
 *
 * `undefined` and `null` are dropped rather than sent as the strings "undefined"
 * and "null" — Stripe would store both, and a metadata field reading "null" is
 * the kind of thing that is only ever noticed while reconciling a refund.
 */
export function formEncode(value: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        const indexed = `${name}[${index}]`;
        parts.push(
          typeof item === 'object' && item !== null
            ? formEncode(item as Record<string, unknown>, indexed)
            : `${encodeURIComponent(indexed)}=${encodeURIComponent(String(item))}`,
        );
      });
    } else if (typeof entry === 'object') {
      parts.push(formEncode(entry as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(entry))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

/**
 * One call to Stripe.
 *
 * `Stripe-Version` is pinned rather than left to the account's default, because
 * the account default is a dashboard setting somebody can change from a browser
 * — and a response shape that moves under a running deployment is a failure with
 * no commit behind it.
 *
 * `Idempotency-Key` is sent on every POST that has one. Stripe replays the
 * original response for 24 hours, which turns a retried checkout creation into
 * the same session rather than a second one.
 */
async function callStripe<T>(
  path: string,
  { method = 'GET', body, idempotencyKey }: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; idempotencyKey?: string } = {},
): Promise<T> {
  const key = env.stripe.secretKey;
  if (!key) throw new StripeError(503, 'stripe_unconfigured', 'no STRIPE_SECRET_KEY on this deployment');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': env.stripe.apiVersion,
  };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${env.stripe.apiBase}${path}`, {
      method,
      headers,
      body: body ? formEncode(body) : undefined,
    });
  } catch (error) {
    // Stripe unreachable is a 502 to whoever is waiting, not a 500 in our logs:
    // nothing of ours is broken and the request is worth retrying.
    throw new StripeError(502, 'stripe_unreachable', error instanceof Error ? error.message : 'stripe could not be reached');
  }

  const text = await response.text();
  const payload = text ? (safeJson(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const detail = (payload.error ?? {}) as Record<string, unknown>;
    throw new StripeError(
      response.status,
      typeof detail.code === 'string' ? detail.code : 'stripe_error',
      typeof detail.message === 'string' ? detail.message : `stripe returned ${response.status}`,
    );
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/**
 * A Price, cached briefly.
 *
 * The cache is not about Stripe's rate limit — it is about `/v1/credits`, which
 * the paywall polls while it waits for a webhook. Without it, watching one
 * integer change would fan out into three Stripe round trips every couple of
 * seconds. Sixty seconds of staleness on a figure that changes when somebody
 * edits it in a dashboard is not a correctness question; a price the visitor is
 * *charged* is read from the Price object by Stripe itself at checkout, so this
 * copy can only ever be wrong on a label, never on a till.
 */
const priceCache = new Map<string, { price: StripePrice; at: number }>();

export async function fetchPrice(priceId: string): Promise<StripePrice | null> {
  const cached = priceCache.get(priceId);
  if (cached && Date.now() - cached.at < env.stripe.priceCacheMs) return cached.price;

  try {
    const raw = await callStripe<{ id: string; unit_amount: number | null; currency: string; active: boolean }>(
      `/v1/prices/${encodeURIComponent(priceId)}`,
    );
    // A price with no `unit_amount` is tiered or metered, which a credit pack is
    // not. Reported as "no price yet" rather than guessed at, for the same
    // reason a pack with no Price id is.
    if (typeof raw.unit_amount !== 'number') return null;
    const price: StripePrice = { id: raw.id, amount: raw.unit_amount, currency: (raw.currency ?? 'usd').toUpperCase() };
    priceCache.set(priceId, { price, at: Date.now() });
    return price;
  } catch {
    // A missing or deleted Price is a pack that cannot be quoted, not a failed
    // request for the balance it is listed beside. `/v1/credits` still answers.
    return null;
  }
}

/** For the tests, and for a deployment that has just re-pointed a pack. */
export const clearPriceCache = (): void => void priceCache.clear();

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  priceId: string;
  userId: string;
  productId: string;
  credits: number;
  successUrl: string;
  cancelUrl: string;
  email?: string | null;
}

/**
 * A hosted Checkout Session for one pack.
 *
 * Three things on it are load-bearing and are not decoration:
 *
 * - **`client_reference_id` is our user id.** It is the only thing that ties the
 *   money to an account, it is set by this server rather than by the browser,
 *   and it comes back on the webhook signed by Stripe. Nothing the client says
 *   about who it is survives past this call.
 * - **`metadata` carries the product and the credit count.** Not because the
 *   webhook trusts it — `applyStripeEvent` looks the product up in
 *   `credit_products` and takes *that* count — but because a purchase row and a
 *   Stripe dashboard that disagree about what was sold is the worst thing to
 *   discover during a refund.
 * - **`mode: 'payment'`.** A credit pack is a consumable, not a subscription.
 *   Nothing here renews, which is a sentence the site says out loud.
 *
 * `payment_intent_data[metadata]` repeats it onto the PaymentIntent, because a
 * refund event names the PaymentIntent and not the session.
 */
export async function createCheckoutSession(request: CheckoutRequest): Promise<StripeSession> {
  const raw = await callStripe<Record<string, unknown>>('/v1/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'payment',
      line_items: [{ price: request.priceId, quantity: 1 }],
      client_reference_id: request.userId,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      customer_email: request.email ?? undefined,
      // Stripe collects and remits where it must; a pack is the same product
      // everywhere and the tax on it is not ours to compute.
      automatic_tax: { enabled: env.stripe.automaticTax },
      /**
       * A real invoice, with a number on it, issued by the party that took the
       * money.
       *
       * The account page offers a document per payment, and this is what makes
       * that document an invoice rather than a receipt. It is the same argument
       * as the price: an invoice needs a sequence, a tax registration and an
       * address, none of which this service holds or should start holding to
       * produce a PDF. Stripe has all three.
       *
       * It is not retroactive — a payment taken before this was enabled has no
       * invoice and never will — so `paymentDocument` falls back to the charge's
       * hosted receipt rather than telling somebody their purchase has no proof.
       */
      invoice_creation: env.stripe.invoices ? { enabled: true } : undefined,
      metadata: { userId: request.userId, productId: request.productId, credits: String(request.credits) },
      payment_intent_data: {
        metadata: { userId: request.userId, productId: request.productId, credits: String(request.credits) },
      },
    },
    // One session per user per product per minute, so a double-clicked Buy
    // button is one session rather than two abandoned ones in the dashboard.
    idempotencyKey: `luvo_${request.userId}_${request.productId}_${Math.floor(Date.now() / 60_000)}`,
  });
  return readSessionObject(raw);
}

export async function retrieveSession(sessionId: string): Promise<StripeSession> {
  return readSessionObject(await callStripe<Record<string, unknown>>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`));
}

/**
 * Stripe's snake_case into ours, and the `payment_intent` expansion problem.
 *
 * `payment_intent` is a string id on an unexpanded session and an object on an
 * expanded one, and both shapes arrive here — the webhook's session is
 * unexpanded, and a retrieve may not be. Reading only the string would silently
 * store `null` as the transaction id for one of the two paths, which is the
 * column both idempotency indexes are built on.
 */
export function readSessionObject(raw: Record<string, unknown>): StripeSession {
  const intent = raw.payment_intent;
  return {
    id: String(raw.id ?? ''),
    url: typeof raw.url === 'string' ? raw.url : null,
    paymentStatus: String(raw.payment_status ?? 'unpaid'),
    status: String(raw.status ?? 'open'),
    clientReferenceId: typeof raw.client_reference_id === 'string' ? raw.client_reference_id : null,
    metadata: (raw.metadata as Record<string, string> | null) ?? {},
    paymentIntentId:
      typeof intent === 'string'
        ? intent
        : typeof (intent as { id?: unknown })?.id === 'string'
          ? String((intent as { id: string }).id)
          : null,
    amountTotal: typeof raw.amount_total === 'number' ? raw.amount_total : null,
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : null,
    customerEmail:
      typeof raw.customer_email === 'string'
        ? raw.customer_email
        : typeof (raw.customer_details as { email?: unknown } | undefined)?.email === 'string'
          ? String((raw.customer_details as { email: string }).email)
          : null,
  };
}

// ---------------------------------------------------------------------------
// The signature
// ---------------------------------------------------------------------------

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  livemode?: boolean;
}

/**
 * Verifies a delivery and returns the event, or throws.
 *
 * The header is `t=<unix>,v1=<hex>[,v1=<hex>]`, and more than one `v1` is
 * normal rather than exotic: during a secret rotation Stripe signs with both,
 * so accepting *any* matching scheme means a rotation is not an outage. Only
 * `v1` is considered — `v0` is the older scheme and is not signed over the same
 * payload.
 */
export function verifyWebhookSignature(raw: Buffer, header: string | undefined, secret: string): StripeEvent {
  if (!header) throw new StripeError(400, 'signature_missing', 'no Stripe-Signature header');

  const fields = new Map<string, string[]>();
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    fields.set(key.trim(), [...(fields.get(key.trim()) ?? []), value.trim()]);
  }

  const timestamp = fields.get('t')?.[0];
  const signatures = fields.get('v1') ?? [];
  if (!timestamp || !signatures.length) throw new StripeError(400, 'signature_malformed', 'Stripe-Signature is not in the expected form');

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > env.stripe.webhookToleranceSeconds) {
    // The signature is still valid; the delivery is old. That is a replay, and
    // it is the only thing the timestamp exists to catch.
    throw new StripeError(400, 'signature_expired', 'the delivery timestamp is outside the tolerance window');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest();
  const matched = signatures.some((candidate) => {
    const presented = Buffer.from(candidate, 'hex');
    // `timingSafeEqual` throws on a length mismatch rather than returning false,
    // so the lengths are compared first — which leaks only the length, and the
    // length of a SHA-256 digest is not a secret.
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  });
  if (!matched) throw new StripeError(400, 'signature_invalid', 'the signature does not match the payload');

  const event = safeJson(raw.toString('utf8')) as Partial<StripeEvent>;
  if (!event?.id || !event.type || !event.data?.object) {
    throw new StripeError(400, 'invalid_event', 'the payload is not a Stripe event');
  }
  return event as StripeEvent;
}

/** For the sandbox, which signs its own deliveries with the same function. */
export function signWebhookPayload(raw: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

// ---------------------------------------------------------------------------
// The document for a payment
// ---------------------------------------------------------------------------

/**
 * What a buyer can be handed as proof of one payment.
 *
 * `invoice` is the real thing: a numbered PDF Stripe issued, which is what
 * `invoice_creation` above buys. `receipt` is Stripe's hosted receipt page for
 * the charge — printable, permanent, and the only thing that exists for a
 * payment taken before invoices were switched on. The two are reported
 * separately rather than flattened into "a link", because a page that calls a
 * receipt an invoice is telling somebody's accountant something untrue.
 */
export interface PaymentDocument {
  kind: 'invoice' | 'receipt';
  url: string;
  /** The invoice number, where there is one. Receipts have none. */
  number: string | null;
}

/**
 * Looks one up from the PaymentIntent, which is the only Stripe identity this
 * service stores.
 *
 * Nothing is cached and no url is written to the database, for the reason no
 * price is: these are Stripe's documents and Stripe's addresses for them. A
 * stored `invoice_pdf` is a link that outlives whatever it pointed at, handed
 * to somebody at the exact moment they need it to work.
 *
 * Two calls at worst and one in the common case. `latest_charge` is expanded so
 * the receipt url and the invoice id arrive together — asking for the charge
 * separately would be a third round trip for a button press.
 */
export async function paymentDocument(paymentIntentId: string): Promise<PaymentDocument | null> {
  // A purchase whose transaction id is a session rather than a payment is the
  // zero-amount case `grantStripeSession` falls back to. There is no charge
  // behind it and so no document, which is correct rather than a failure: a
  // payment of nothing has nothing to prove.
  if (!paymentIntentId.startsWith('pi_')) return null;

  const intent = await callStripe<Record<string, unknown>>(
    `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
  );
  const charge = (intent.latest_charge ?? null) as Record<string, unknown> | string | null;
  if (!charge || typeof charge === 'string') return null;

  const invoiceId =
    typeof charge.invoice === 'string'
      ? charge.invoice
      : typeof (charge.invoice as { id?: unknown } | null)?.id === 'string'
        ? String((charge.invoice as { id: string }).id)
        : null;

  if (invoiceId) {
    const invoice = await callStripe<Record<string, unknown>>(`/v1/invoices/${encodeURIComponent(invoiceId)}`);
    // The PDF first: the request was to *download* an invoice, and the hosted
    // page is a page. It is kept as the fallback because an invoice that is
    // still being finalised has the second and not yet the first.
    const url =
      typeof invoice.invoice_pdf === 'string'
        ? invoice.invoice_pdf
        : typeof invoice.hosted_invoice_url === 'string'
          ? invoice.hosted_invoice_url
          : null;
    if (url) return { kind: 'invoice', url, number: typeof invoice.number === 'string' ? invoice.number : null };
  }

  return typeof charge.receipt_url === 'string' ? { kind: 'receipt', url: charge.receipt_url, number: null } : null;
}
