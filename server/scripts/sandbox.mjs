#!/usr/bin/env node
/**
 * A whole Luvo backend, on your laptop, with nothing behind it.
 *
 *   npm run build && npm run sandbox
 *
 * The real Fastify routes, the real migrations, the real credit ledger and the
 * real job queue — against an in-memory Postgres, an in-process bucket and a
 * worker that never calls a model. Nothing here reaches Railway, R2 or fal, so
 * nothing here can spend money or touch production data.
 *
 * ## Why this exists rather than a second Railway database
 *
 * Testing credits means granting them, refunding them, resetting free
 * allowances and deleting accounts. Doing that against the database the app
 * actually uses is how a test run becomes an incident, and `DATABASE_URL` in
 * this checkout points at the production proxy. An in-memory database also
 * starts empty every time, which is what makes "does a reinstall get two more
 * free generations" a question you can ask twice.
 *
 * ## What is real and what is not
 *
 * **Real:** every route, the migrations, the credit ledger and its transactions,
 * install anchors, the queue's compare-and-set claim, sign-in with email, the
 * RevenueCat webhook including both its idempotency indexes, and the SigV4
 * presigning — the app really does PUT its photograph to a signed url.
 *
 * **Not real:** the model. No generation happens; the "preview" that comes back
 * is the photograph that went in, so the whole flow completes and the credit
 * settles without a five-cent request. Apple and Google sign-in are also not
 * real here, because both verify against the provider's live keys — use email,
 * which is the point of having a third option.
 *
 * ## Driving it
 *
 * Two ways, and they exercise the same server. `scripts/sandbox-cli.mjs` drives
 * it from a terminal with no phone at all; or point the app at it with
 * `EXPO_PUBLIC_API_URL` and use the thing you are actually shipping. The
 * `/__sandbox` control routes are what make the second one bearable: forcing a
 * generation to fail is one request rather than a wait and a hope.
 */

import { createHash, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const PORT = Number(flag('port', '8099'));
/**
 * The address the app is told to upload to.
 *
 * `127.0.0.1` is right for the CLI and useless to a phone, which is on the LAN
 * and will happily fail to reach your loopback. So the default is the first
 * non-internal IPv4 address on this machine, which is what
 * `EXPO_PUBLIC_API_URL` already has to be for any of this to work from a device.
 */
const HOST = flag('host', lanAddress());
/** How long the fake worker pretends to be busy. Long enough to watch. */
const DELAY_MS = Number(flag('delay', '4000'));

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

// ---------------------------------------------------------------------------
// Configuration, before anything reads it
// ---------------------------------------------------------------------------

/**
 * Set before `dist/env.js` is imported, which is why every import below is
 * dynamic. `env.ts` reads `process.env` once at module load, so a static import
 * at the top of this file would be evaluated before any of this ran.
 *
 * The R2 values are deliberately real-looking and deliberately point at this
 * process: `createStorage` builds `${endpoint}/${bucket}/${key}`, so signed urls
 * come out addressed to the in-process bucket below. The credentials are
 * nonsense because nothing verifies them here.
 */
const ORIGIN = `http://${HOST}:${PORT}`;
process.env.DATABASE_URL = 'postgres://sandbox/local';
process.env.PREVIEW_BUCKET = '__bucket';
process.env.R2_ENDPOINT = ORIGIN;
process.env.R2_ACCESS_KEY_ID = 'sandbox';
process.env.R2_SECRET_ACCESS_KEY = 'sandbox-secret';
process.env.R2_REGION = 'auto';
// Present so `configured()` passes. Nothing in this process calls fal.
process.env.FAL_KEY = 'sandbox-not-a-real-key';
process.env.CREDITS_ENFORCED = has('unmetered') ? 'false' : 'true';
process.env.FREE_GENERATIONS = flag('free', '2');
process.env.ANCHOR_SALT = 'sandbox';
// The whole reason email sign-in exists as a third option: it is the only one
// that can be completed without a provider's live signing keys.
process.env.EMAIL_DEV_ECHO = 'true';
process.env.REVENUECAT_WEBHOOK_SECRET = 'sandbox-webhook-secret';
/**
 * Stripe, served by this process from `/__stripe`.
 *
 * `STRIPE_API_BASE` is the one environment variable in the whole service that
 * exists for testing, and this is what it is for: the server's real checkout
 * code — the form encoding, the session read-back, the signature check — runs
 * unchanged against a Stripe that lives in a Map twenty lines down. A complete
 * purchase can therefore be walked with no Stripe account, no key and no
 * network, which is the same thing the fake worker does for fal.
 *
 * `CHECKOUT_RETURN_URL` is where the finished checkout sends the browser back
 * to, and it is the *website's* origin rather than this API's. `--web` overrides
 * it for a dev server on another port.
 */
process.env.STRIPE_SECRET_KEY = 'sk_sandbox_not_a_real_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_sandbox';
process.env.STRIPE_API_BASE = `${ORIGIN}/__stripe`;
process.env.CHECKOUT_RETURN_URL = flag('web', 'http://localhost:3000');
process.env.LOG_LEVEL = has('verbose') ? 'info' : 'warn';
process.env.CORS_ORIGIN = '*';

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

let newDb;
try {
  ({ newDb } = await import('pg-mem'));
} catch {
  console.error('pg-mem is not installed. Run `npm install` in server/.');
  process.exit(1);
}

const db = newDb({ autoCreateForeignKeyIndices: true });
db.public.registerFunction({
  name: 'now',
  returns: db.public.getType?.('timestamptz') ?? undefined,
  implementation: () => new Date(),
  impure: true,
});

const { Client } = db.adapters.createPg();
const client = new Client();
await client.connect();

for (const file of (await readdir(path.join(SERVER_ROOT, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()) {
  await client.query(await readFile(path.join(SERVER_ROOT, 'migrations', file), 'utf8'));
}

const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('Run `npm run build` first — the sandbox serves the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);
// `withTransaction` takes a connection rather than the pool, so the settle path
// needs this too — the same substitution `check-credits.mjs` makes.
dbModule.pool.connect = async () => ({
  query: (text, values) => client.query(text, values),
  release: () => undefined,
});

const sql = (text, values = []) => client.query(text, values).then((result) => result.rows);

// ---------------------------------------------------------------------------
// A catalog to browse
// ---------------------------------------------------------------------------

const { loadCatalog } = await import('../../scripts/lib/catalog.mjs');
const { writeHairstyle, writeReferenceTables } = await import('./lib/metadata.mjs');

const authored = await loadCatalog({ root: REPO_ROOT });
await writeReferenceTables(client, authored);
for (const style of authored.hairstyles) await writeHairstyle(client, style);

/**
 * A Price id per pack, which a real deployment gets from
 * `scripts/stripe-setup.mjs` against a real Stripe account.
 *
 * Derived from the credit count so the fake Stripe below can answer for any pack
 * the catalog grows, including one added by hand while the sandbox is running.
 */
for (const pack of await sql('select id, credits from credit_products')) {
  await sql('update credit_products set stripe_price_id = $2 where id = $1', [pack.id, `price_sbx_${pack.credits}`]);
}

const jobs = await import('../dist/jobs.js');
const credits = await import('../dist/credits.js');
const { applyWebhookEvent } = await import('../dist/purchases.js');
const { signWebhookPayload } = await import('../dist/stripe.js');
const { deviceIdFor } = await import('../dist/devices.js');
const { anchorIdFor } = await import('../dist/anchors.js');
const { routes } = await import('../dist/routes.js');

// ---------------------------------------------------------------------------
// The bucket
// ---------------------------------------------------------------------------

/**
 * An object store in a Map.
 *
 * Enough of S3 for this pipeline: PUT, GET, HEAD, DELETE. The signature on the
 * incoming url is **not verified**, which is the one security property this
 * deliberately drops — it is signed correctly on the way out, so the app's
 * signing path is genuinely exercised, and there is nobody to defend against on
 * a loopback interface.
 */
const bucket = new Map();

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

const Fastify = (await import('fastify')).default;
const cors = (await import('@fastify/cors')).default;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL } });

await app.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'accept', 'x-install-anchor'],
});

/** Raw bytes for the bucket, and nothing else — the API itself is JSON. */
app.addContentTypeParser(
  ['image/jpeg', 'image/png', 'application/octet-stream'],
  { parseAs: 'buffer' },
  (_request, body, done) => done(null, body),
);

/**
 * Stripe posts form bodies, and Fastify parses JSON.
 *
 * Only the `/__stripe` routes below need this — it is the shape the server's own
 * `formEncode` produces on the way out. Keys arrive flat and bracketed
 * (`metadata[userId]`), which is exactly how they are read back, so nothing here
 * un-nests them.
 */
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_request, body, done) => {
    const parsed = {};
    for (const [key, value] of new URLSearchParams(body)) parsed[key] = value;
    done(null, parsed);
  },
);

await app.register(routes);

// ---------------------------------------------------------------------------
// A Stripe, in a Map
// ---------------------------------------------------------------------------

/**
 * Enough of Stripe for one purchase, and deliberately not one line more.
 *
 * **Real here:** the request the server builds, the session it gets back, the
 * read-back on confirmation, the HMAC on the webhook and both idempotency
 * indexes behind it. The `/__stripe/pay/:id` page is a stand-in for Stripe
 * Checkout, and pressing Pay does what Stripe does — marks the session paid,
 * delivers a signed `checkout.session.completed`, and redirects to `success_url`.
 *
 * **Not real:** the card, the money, the signature on the outgoing session, and
 * Stripe's own idea of what a Price costs. The amounts below match the seeds in
 * `scripts/stripe-setup.mjs` so a sandbox page reads like the real one.
 *
 * The webhook is delivered through `app.inject` rather than over the network,
 * because a delivery to `127.0.0.1` from a process bound to a LAN address is one
 * more thing that can be wrong on somebody's laptop for reasons unrelated to
 * what is being tested. It is the same Fastify instance, the same route and the
 * same signature check either way.
 */
const stripeSessions = new Map();
const SANDBOX_AMOUNTS = { 5: 499, 10: 999, 20: 1499 };

app.get('/__stripe/v1/prices/:id', async (request, reply) => {
  const credits = Number(String(request.params.id).replace('price_sbx_', ''));
  const amount = SANDBOX_AMOUNTS[credits] ?? credits * 100;
  if (!Number.isFinite(credits) || !credits) return reply.code(404).send({ error: { message: 'no such price' } });
  return { id: request.params.id, object: 'price', unit_amount: amount, currency: 'usd', active: true };
});

app.post('/__stripe/v1/checkout/sessions', async (request) => {
  const body = request.body ?? {};
  const id = `cs_sbx_${randomUUID().replace(/-/g, '')}`;
  const credits = Number(body['metadata[credits]'] ?? 0);
  const session = {
    id,
    object: 'checkout.session',
    url: `${ORIGIN}/__stripe/pay/${id}`,
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
    client_reference_id: body.client_reference_id ?? null,
    metadata: {
      userId: body['metadata[userId]'] ?? '',
      productId: body['metadata[productId]'] ?? '',
      credits: String(credits),
    },
    amount_total: SANDBOX_AMOUNTS[credits] ?? credits * 100,
    currency: 'usd',
    // Carried so the stand-in shows what the real page prefills. Stripe holds
    // this read-only once it is set, and a sandbox that dropped it would make
    // the one difference between the two tills invisible.
    customer_email: body.customer_email ?? null,
    success_url: body.success_url ?? '',
    cancel_url: body.cancel_url ?? '',
  };
  stripeSessions.set(id, session);
  return session;
});

/**
 * The payment behind a paid session, and the invoice for it.
 *
 * `paymentDocument` asks Stripe for the PaymentIntent with its charge expanded,
 * then for the invoice named on that charge. Both are answered here so the
 * account page's Invoice button is a working button in the sandbox rather than
 * the one control that needs a real key — which is the same argument the Pay
 * button makes. The document it opens is a stand-in and says so on its face.
 */
const stripeIntents = new Map();
const stripeInvoices = new Map();

app.get('/__stripe/v1/payment_intents/:id', async (request, reply) => {
  const intent = stripeIntents.get(request.params.id);
  if (!intent) return reply.code(404).send({ error: { message: 'no such payment intent' } });
  return intent;
});

app.get('/__stripe/v1/invoices/:id', async (request, reply) => {
  const invoice = stripeInvoices.get(request.params.id);
  if (!invoice) return reply.code(404).send({ error: { message: 'no such invoice' } });
  return invoice;
});

app.get('/__stripe/invoice/:id', async (request, reply) => {
  const invoice = stripeInvoices.get(request.params.id);
  if (!invoice) return reply.code(404).type('text/html').send('<p>no such invoice</p>');
  const amount = (invoice.amount_paid / 100).toFixed(2);
  return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoice.number}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5f8;color:#1a1626;
       font:15px/1.6 system-ui,sans-serif}
  .sheet{width:min(560px,92vw);background:#fff;border-radius:14px;padding:40px;
         box-shadow:0 1px 3px rgba(0,0,0,.12)}
  h1{margin:0 0 2px;font-size:22px} .n{color:#6b6580;font-size:13px;margin:0 0 28px}
  .row{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid #eceaf0}
  .row.total{border-top:2px solid #1a1626;font-weight:700}
  .note{margin-top:28px;color:#6b6580;font-size:12.5px}
</style>
<div class="sheet">
  <h1>Invoice ${invoice.number}</h1>
  <p class="n">${new Date(invoice.created * 1000).toDateString()} &middot; ${invoice.customer_email ?? 'no email on file'}</p>
  <div class="row"><span>Luvo credits</span><span>$${amount}</span></div>
  <div class="row total"><span>Paid</span><span>$${amount}</span></div>
  <p class="note">A sandbox stand-in for the PDF Stripe issues. No money moved and this is
     not a document anybody should file.</p>
</div>`);
});

app.get('/__stripe/v1/checkout/sessions/:id', async (request, reply) => {
  const session = stripeSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: { message: 'no such checkout session' } });
  return session;
});

/** Stripe Checkout, as one button and no card field. */
app.get('/__stripe/pay/:id', async (request, reply) => {
  const session = stripeSessions.get(request.params.id);
  if (!session) return reply.code(404).type('text/html').send('<p>no such session</p>');
  const amount = (session.amount_total / 100).toFixed(2);
  return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sandbox checkout</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a12;color:#efeaf7;
       font:15px/1.5 system-ui,sans-serif}
  .card{width:min(420px,92vw);background:#15121f;border:1px solid #2a2438;border-radius:20px;padding:28px}
  h1{margin:0 0 4px;font-size:20px} p{margin:0 0 20px;color:#a79fba;font-size:13px}
  .row{display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid #2a2438;font-size:14px}
  button{width:100%;height:44px;margin-top:20px;border:0;border-radius:999px;background:#a98cfb;color:#150e28;
         font:600 14px system-ui;cursor:pointer}
  a{display:block;margin-top:12px;text-align:center;color:#a79fba;font-size:12.5px}
  code{color:#7e7692;font-size:11px}
</style>
<div class="card">
  <h1>Sandbox checkout</h1>
  <p>No card, no money, no Stripe. Pressing Pay delivers a signed
     <code>checkout.session.completed</code> to this deployment's own webhook.</p>
  <div class="row"><span>${session.metadata.credits} previews</span><b>$${amount}</b></div>
  <div class="row"><span>Account</span><code>${session.client_reference_id ?? '—'}</code></div>
  <div class="row"><span>Email</span><code>${session.customer_email ?? 'not on the account — Stripe would ask'}</code></div>
  <form method="post" action="/__stripe/pay/${session.id}"><button type="submit">Pay $${amount}</button></form>
  <a href="${session.cancel_url}">Cancel and go back</a>
</div>`);
});

app.post('/__stripe/pay/:id', async (request, reply) => {
  const session = stripeSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: 'no such session' });

  session.payment_status = 'paid';
  session.status = 'complete';
  session.payment_intent = `pi_sbx_${randomUUID().replace(/-/g, '')}`;

  // The invoice Checkout would have raised, and the charge that names it. Both
  // are what `paymentDocument` walks on the way to the Invoice button's url.
  const invoiceId = `in_sbx_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  stripeInvoices.set(invoiceId, {
    id: invoiceId,
    object: 'invoice',
    number: `LUVO-${invoiceId.slice(-6).toUpperCase()}`,
    created: Math.floor(Date.now() / 1000),
    amount_paid: session.amount_total,
    currency: session.currency,
    customer_email: session.customer_email ?? null,
    invoice_pdf: `${ORIGIN}/__stripe/invoice/${invoiceId}`,
    hosted_invoice_url: `${ORIGIN}/__stripe/invoice/${invoiceId}`,
  });
  stripeIntents.set(session.payment_intent, {
    id: session.payment_intent,
    object: 'payment_intent',
    amount: session.amount_total,
    currency: session.currency,
    latest_charge: {
      id: `ch_sbx_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      object: 'charge',
      invoice: invoiceId,
      receipt_url: `${ORIGIN}/__stripe/invoice/${invoiceId}`,
    },
  });

  const payload = JSON.stringify({
    id: `evt_sbx_${randomUUID().replace(/-/g, '')}`,
    type: 'checkout.session.completed',
    data: { object: session },
  });
  const delivered = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/stripe',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signWebhookPayload(payload, process.env.STRIPE_WEBHOOK_SECRET),
    },
    payload,
  });
  console.log(`  [stripe] ${session.id} paid — webhook ${delivered.statusCode} ${delivered.body}`);

  return reply.redirect(session.success_url.replace('{CHECKOUT_SESSION_ID}', session.id), 303);
});

/**
 * A refund, which is the other half nobody can ask a real Stripe for on demand.
 *
 * Posts a genuine `charge.refunded` through the same signed path, so the revoke
 * branch and its clamp-at-zero are exercised rather than assumed.
 */
app.post('/__sandbox/stripe/refund', async (request, reply) => {
  const paymentIntent = request.body?.paymentIntent;
  if (!paymentIntent) {
    reply.code(400);
    return { error: 'invalid_request', message: 'paymentIntent is required — a refund names a payment' };
  }
  const payload = JSON.stringify({
    id: `evt_sbx_${randomUUID().replace(/-/g, '')}`,
    type: 'charge.refunded',
    data: { object: { object: 'charge', payment_intent: paymentIntent, refunded: true } },
  });
  const delivered = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/stripe',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signWebhookPayload(payload, process.env.STRIPE_WEBHOOK_SECRET),
    },
    payload,
  });
  return { status: delivered.statusCode, outcome: JSON.parse(delivered.body || '{}') };
});

// --- the in-process bucket -------------------------------------------------

app.put('/__bucket/*', async (request, reply) => {
  const key = decodeURIComponent(request.params['*']);
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ''));
  bucket.set(key, { body, contentType: request.headers['content-type'] ?? 'application/octet-stream' });
  return reply.code(200).send('');
});

/**
 * GET and HEAD on one registration.
 *
 * Both matter and they cannot be two routes: Fastify synthesises a HEAD for
 * every GET, so a separate `app.head` for the same url is a duplicate-route
 * error at boot. Naming both methods here registers one handler for both and
 * suppresses the shadow. HEAD is not decorative — `storage.head()` is what
 * `POST /:id/ready` uses to check the upload actually arrived, so a bucket that
 * did not answer it would leave every job stuck in `awaiting_upload`.
 *
 * Fastify drops the body for a HEAD by itself and keeps the content-length,
 * which is the one header that call reads.
 */
app.route({
  method: ['GET', 'HEAD'],
  url: '/__bucket/*',
  handler: async (request, reply) => {
    const object = bucket.get(decodeURIComponent(request.params['*']));
    if (!object) return reply.code(404).send('');
    return reply
      .header('content-type', object.contentType)
      .header('content-length', String(object.body.length))
      .send(object.body);
  },
});

app.delete('/__bucket/*', async (request, reply) => {
  bucket.delete(decodeURIComponent(request.params['*']));
  return reply.code(204).send();
});

// ---------------------------------------------------------------------------
// The control room
// ---------------------------------------------------------------------------

/**
 * What the *next* generation does.
 *
 * The single most useful thing in this file. "Does a failed generation refund
 * the credit" is nearly untestable against a real model — you cannot ask fal to
 * fail — and is one request here. It is a setting rather than a per-job
 * argument because the phone is what submits the job, and the phone has no way
 * to say "make this one fail".
 */
let nextOutcome = 'ready';

/**
 * The device id behind a control request.
 *
 * `device` is always a **secret** and is always hashed. The first version tried
 * to accept either a secret or an id, distinguishing them by shape — and they
 * have the same shape: the secret is 32 random bytes as hex and the id is a
 * sha256 of it as hex, so both are 64 hex characters. Every request hashed the
 * wrong one silently and looked up a device that did not exist. `deviceId` is
 * the explicit escape hatch for the rare case of having only the hash.
 */
const deviceIdFrom = (body) =>
  typeof body?.deviceId === 'string' ? body.deviceId : deviceIdFor(String(body?.device ?? ''));

app.get('/__sandbox/state', async (request) => {
  const deviceId = deviceIdFrom(request.query);
  const state = await credits.creditState(deviceId);
  const [device] = await sql('select id, user_id, push_token from devices where id = $1', [deviceId]);
  return {
    device: device ?? null,
    credits: state,
    anchors: await sql(
      `select a.anchor_id, i.kind, f.granted, f.used, f.held
         from device_anchors a
         join install_anchors i on i.id = a.anchor_id
         left join free_allowance f on f.anchor_id = a.anchor_id
        where a.device_id = $1`,
      [deviceId],
    ),
    jobs: await sql(
      `select id, status, hairstyle_id, charge_source, charge_settled, error_code
         from preview_jobs where device_id = $1 order by created_at desc limit 10`,
      [deviceId],
    ),
    ledger: await sql(
      `select kind, source, delta, reason, job_id from credit_ledger
        where device_id = $1 or user_id = (select user_id from devices where id = $1)
        order by id desc limit 20`,
      [deviceId],
    ),
    nextOutcome,
    objectsInBucket: bucket.size,
  };
});

/** What the fake worker will do to the next job it picks up. */
app.post('/__sandbox/next', async (request, reply) => {
  const outcome = request.body?.outcome;
  if (!['ready', 'failed', 'hang'].includes(outcome)) {
    reply.code(400);
    return { error: 'invalid_request', message: 'outcome must be ready, failed or hang' };
  }
  nextOutcome = outcome;
  return { nextOutcome };
});

/**
 * A purchase, without a store.
 *
 * Posts a genuine RevenueCat-shaped event through the real handler, so the
 * idempotency indexes, the product lookup and the ledger write are all the ones
 * that will run in production. Only the receipt validation is skipped, and that
 * is the part RevenueCat does rather than us.
 */
app.post('/__sandbox/purchase', async (request, reply) => {
  const body = request.body ?? {};
  const deviceId = deviceIdFrom(body);
  const userId = body.userId ?? (await credits.userForDevice(deviceId));
  if (!userId) {
    reply.code(409);
    return { error: 'account_required', message: 'sign in on this device first — credits live on an account' };
  }
  const outcome = await applyWebhookEvent({
    id: body.eventId ?? `sbx_${randomUUID()}`,
    type: body.type ?? 'NON_RENEWING_PURCHASE',
    app_user_id: userId,
    product_id: body.productId ?? 'com.luvoai.luvo.credits.10',
    transaction_id: body.transactionId ?? `sbx_txn_${randomUUID()}`,
    store: body.store ?? 'APP_STORE',
    environment: body.environment ?? 'PRODUCTION',
    price_in_purchased_currency: body.price ?? 9.99,
    currency: body.currency ?? 'USD',
  });
  return { outcome, credits: await credits.creditState(deviceId) };
});

/** The refund half, which is the same handler with a different type. */
app.post('/__sandbox/refund', async (request, reply) => {
  const body = request.body ?? {};
  const deviceId = deviceIdFrom(body);
  const userId = body.userId ?? (await credits.userForDevice(deviceId));
  if (!body.transactionId) {
    reply.code(400);
    return { error: 'invalid_request', message: 'transactionId is required — refunds name a purchase' };
  }
  const outcome = await applyWebhookEvent({
    id: `sbx_${randomUUID()}`,
    type: 'CANCELLATION',
    app_user_id: userId,
    product_id: body.productId ?? 'com.luvoai.luvo.credits.10',
    transaction_id: body.transactionId,
    store: body.store ?? 'APP_STORE',
    environment: 'PRODUCTION',
  });
  return { outcome, credits: await credits.creditState(deviceId) };
});

app.get('/__sandbox/purchases', async () =>
  sql('select id, user_id, product_id, credits, store_transaction_id, status from purchases order by created_at'),
);

/**
 * Puts the free allowance back.
 *
 * Not something the product can do — that is the entire point of anchors — so
 * it reaches past the API and clears the rows directly. Useful for running the
 * "two free, then a paywall" walkthrough more than once.
 */
app.post('/__sandbox/reset-free', async (request) => {
  const deviceId = deviceIdFrom(request.body);
  await sql(
    `update free_allowance set used = 0, held = 0
      where anchor_id in (select anchor_id from device_anchors where device_id = $1)`,
    [deviceId],
  );
  return { credits: await credits.creditState(deviceId) };
});

/**
 * What a reinstall looks like, from the server's side.
 *
 * Hands back a *new* device secret carrying the *same* `ANDROID_ID` anchor —
 * which is exactly what an Android reinstall produces, and the thing the free
 * allowance is designed to see through. Send the returned secret as
 * `Authorization: Device <secret>` and the anchor as `X-Install-Anchor` and the
 * server should still say zero free generations.
 */
app.post('/__sandbox/reinstall', async (request) => {
  const secret = `sbx${createHash('sha256').update(randomUUID()).digest('hex').slice(0, 40)}`;
  const androidId = request.body?.androidId ?? '0123456789abcdef';
  return {
    secret,
    deviceId: deviceIdFor(secret),
    installAnchor: `android_id:${androidId}`,
    anchorId: anchorIdFor({ kind: 'android_id', value: androidId }),
    note: 'send both headers — the Keystore is gone, ANDROID_ID is not',
  };
});

app.post('/__sandbox/wipe', async () => {
  for (const table of [
    'credit_ledger',
    'purchases',
    'preview_jobs',
    'free_allowance',
    'device_anchors',
    'install_anchors',
    'credit_balances',
    'user_identities',
    'email_codes',
    'devices',
    'users',
  ]) {
    await sql(`delete from ${table}`);
  }
  bucket.clear();
  return { wiped: true };
});

// ---------------------------------------------------------------------------
// The worker that never generates anything
// ---------------------------------------------------------------------------

/**
 * The real queue transitions, with the model taken out.
 *
 * It claims through `claimNext` and settles through `markReady` / `markFailed`,
 * which is where the credit is spent or refunded — so the part under test is the
 * real code path and only the forty seconds of image generation is missing. The
 * "preview" it produces is the uploaded photograph copied to the result key,
 * which makes it obvious in the app that nothing was generated.
 */
async function tick() {
  const job = await jobs.claimNext(jobs.leaseFor(120), 1);
  if (!job) return;

  await jobs.markSubmitted(job.id, {
    requestId: `sbx_${randomUUID()}`,
    statusUrl: 'sandbox://status',
    responseUrl: 'sandbox://result',
    model: 'sandbox/no-model',
    variant: null,
    views: ['half'],
    leaseUntil: jobs.leaseFor(120),
  });

  const outcome = nextOutcome;
  console.log(`  [worker] ${job.id} claimed — will ${outcome === 'hang' ? 'hang' : outcome} in ${DELAY_MS}ms`);
  if (outcome === 'hang') return;

  setTimeout(() => {
    void (async () => {
      try {
        if (outcome === 'failed') {
          await jobs.markFailed(job.id, 'the sandbox was told to fail this one', 'sandbox_forced');
          console.log(`  [worker] ${job.id} failed — credit refunded`);
          return;
        }
        const photo = job.photo_key ? bucket.get(job.photo_key) : null;
        const key = jobs.resultKey(job.id);
        bucket.set(key, photo ?? { body: Buffer.from(''), contentType: 'image/jpeg' });
        if (job.photo_key) bucket.delete(job.photo_key);
        await jobs.markReady(job.id, {
          resultKey: key,
          width: job.photo_width,
          height: job.photo_height,
          expiresAt: jobs.retentionDeadline(),
        });
        console.log(`  [worker] ${job.id} ready — credit spent`);
      } catch (error) {
        console.error('  [worker] tick failed', error);
      }
    })();
  }, DELAY_MS);
}

setInterval(() => void tick().catch((error) => console.error('  [worker]', error)), 1000);

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

await app.listen({ port: PORT, host: '0.0.0.0' });

const products = await sql('select id, credits from credit_products order by sort_order');

console.log(`
  Luvo sandbox
  ${'─'.repeat(60)}
  API            ${ORIGIN}
  Database       in memory (pg-mem) — empty, and gone when this stops
  Bucket         in memory — ${ORIGIN}/__bucket
  Generator      none; the preview returned is the photo you sent
  Credits        ${process.env.CREDITS_ENFORCED === 'true' ? `on, ${process.env.FREE_GENERATIONS} free per device` : 'OFF (--unmetered)'}
  Catalog        ${authored.hairstyles.length} hairstyles, no renders (the app draws its fallback silhouettes)

  Point the app at it
    EXPO_PUBLIC_API_URL=${ORIGIN}          in .env.local, then restart the dev server

  Drive it from a terminal
    node scripts/sandbox-cli.mjs scenario  the whole credit story, asserted
    node scripts/sandbox-cli.mjs state

  Control it while the app is open
    POST ${ORIGIN}/__sandbox/next      {"outcome":"failed"}   make the next generation fail
    POST ${ORIGIN}/__sandbox/purchase  {"device":"<secret>"}  grant a pack, via the real webhook path
    POST ${ORIGIN}/__sandbox/reset-free {"device":"<secret>"} hand back the free two
    GET  ${ORIGIN}/__sandbox/state?device=<secret>

  Buy a pack     sign in, then press Buy — checkout is served from
                 ${ORIGIN}/__stripe with no key and no money
  Refund one     POST ${ORIGIN}/__sandbox/stripe/refund {"paymentIntent":"pi_sbx_…"}

  Packs         ${products.map((p) => `${p.id} (${p.credits})`).join(', ')}
  Sign-in       email only — the code is returned in the response, not mailed.
                Apple and Google verify against live keys and cannot work here.
  ${'─'.repeat(60)}
`);
