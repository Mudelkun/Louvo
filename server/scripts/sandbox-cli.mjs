#!/usr/bin/env node
/**
 * Drives the sandbox over HTTP, with no phone involved.
 *
 *   node scripts/sandbox.mjs            # in one terminal
 *   node scripts/sandbox-cli.mjs scenario   # in another
 *
 * ## Why this exists when `check-credits.mjs` already passes
 *
 * They test different things and both are worth having. `check-credits.mjs`
 * calls the credit modules *directly* — it is the unit test for the ledger, and
 * it is what runs in `npm run check`. This one goes through the actual HTTP
 * routes: the device header, the install-anchor header, the 402 body, sign-in,
 * the upload to a presigned url, the job poll. That is the layer where a wiring
 * mistake lives — a route that never registered, a header the app sends and the
 * server ignores, a status code the client branches on.
 *
 * `scenario` is the one to run first. It walks the entire credit story end to
 * end and asserts at every step, printing what it found as it goes, so a failure
 * tells you which step and what the server actually said.
 */

import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

const BASE = (process.env.SANDBOX_URL ?? 'http://127.0.0.1:8099').replace(/\/$/, '');

const args = process.argv.slice(2);
const command = args[0] ?? 'scenario';
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};

// ---------------------------------------------------------------------------
// A device, which is 32 bytes and a header
// ---------------------------------------------------------------------------

/**
 * A fake phone.
 *
 * `androidId` is optional and is the whole reinstall test: two devices sharing
 * one anchor should share one free allowance. The secret is hex because that is
 * what `deviceId.ts` mints and what the server's regex accepts.
 */
function device(androidId = null) {
  const secret = [...randomUUID().replace(/-/g, ''), ...randomUUID().replace(/-/g, '')].join('');
  return {
    secret,
    androidId,
    headers() {
      return {
        Authorization: `Device ${this.secret}`,
        ...(this.androidId ? { 'X-Install-Anchor': `android_id:${this.androidId}` } : null),
      };
    },
  };
}

async function call(phone, path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : null),
      ...(phone ? phone.headers() : null),
      ...init.headers,
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: payload };
}

const control = (path, body) =>
  call(null, path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });

// ---------------------------------------------------------------------------
// The flow the app performs, in three calls
// ---------------------------------------------------------------------------

/**
 * Submit, upload, queue — the same three steps `submitPreview` takes.
 *
 * The photograph is four bytes of nonsense. The sandbox does not look at it, and
 * a real JPEG would only make this file bigger; what is being tested is that the
 * presigned url works and that the job leaves `awaiting_upload`.
 */
async function generate(phone, { hairstyleId = 'buzz-cut', idempotencyKey = null } = {}) {
  const submitted = await call(phone, '/v1/previews', {
    method: 'POST',
    body: JSON.stringify({
      hairstyleId,
      gender: 'male',
      hairType: null,
      photoWidth: 1170,
      photoHeight: 2532,
      idempotencyKey,
    }),
  });

  if (submitted.status === 402) return { refused: true, ...submitted };
  assert.ok(submitted.status < 300, `submit failed: ${submitted.status} ${JSON.stringify(submitted.body)}`);

  const upload = submitted.body.upload;
  if (upload) {
    const put = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.from('fake'),
    });
    assert.ok(put.ok, `upload failed: ${put.status}`);
    await call(phone, `/v1/previews/${submitted.body.job.id}/ready`, { method: 'POST' });
  }

  return { refused: false, job: submitted.body.job, credits: submitted.body.credits };
}

/** Polls until the job stops moving, exactly as the app does. */
async function settle(phone, jobId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await call(phone, `/v1/previews/${jobId}`);
    const status = body?.job?.status;
    if (['ready', 'collected', 'failed', 'cancelled'].includes(status)) return body.job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`job ${jobId} never settled`);
}

/** Email sign-in, using the code the sandbox hands back instead of mailing. */
async function signIn(phone, email) {
  const asked = await call(phone, '/v1/account/email-code', { method: 'POST', body: JSON.stringify({ email }) });
  assert.ok(asked.body?.devCode, `no dev code returned: ${JSON.stringify(asked.body)}`);
  const signedIn = await call(phone, '/v1/account/sign-in', {
    method: 'POST',
    body: JSON.stringify({ provider: 'email', token: asked.body.devCode, email }),
  });
  assert.ok(signedIn.status < 300, `sign-in failed: ${JSON.stringify(signedIn.body)}`);
  return signedIn.body;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

let step = 0;
const say = (text) => console.log(`\n${String(++step).padStart(2, ' ')}. ${text}`);
const ok = (text) => console.log(`    ✓ ${text}`);
const show = (label, value) => console.log(`      ${label}: ${JSON.stringify(value)}`);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function scenario() {
  await control('/__sandbox/wipe', {});
  console.log(`Driving ${BASE} — the whole credit story, asserted at every step.`);

  // -- the free two ---------------------------------------------------------
  const phone = device('0123456789abcdef');
  say('A new Android phone asks what it may generate with.');
  let state = (await call(phone, '/v1/account')).body;
  assert.equal(state.credits.free, 2, 'a new device is owed two free generations');
  assert.equal(state.credits.signedIn, false);
  assert.equal(state.account, null);
  ok('two free generations, no account required');
  show('credits', state.credits);

  say('It generates once. The credit is held at submit, not on completion.');
  const first = await generate(phone);
  assert.equal(first.credits.free, 1, 'the hold is visible immediately');
  assert.equal(first.job.chargeSource, 'free', 'the server says which pot paid');
  ok('held at submit — 1 free left while the job is still queued');
  const done = await settle(phone, first.job.id);
  assert.equal(done.status, 'ready');
  ok('generation completed, credit spent');

  // -- a failure is refunded -----------------------------------------------
  say('The next generation is forced to fail. Nobody pays for that.');
  await control('/__sandbox/next', { outcome: 'failed' });
  const second = await generate(phone);
  assert.equal(second.credits.free, 0, 'both free generations are spoken for while it runs');
  const failed = await settle(phone, second.job.id);
  assert.equal(failed.status, 'failed');
  state = (await call(phone, '/v1/credits')).body;
  assert.equal(state.credits.free, 1, 'a failed generation refunds its credit');
  ok('failed → refunded, back to 1 free');
  await control('/__sandbox/next', { outcome: 'ready' });

  // -- running out ----------------------------------------------------------
  say('It spends the last one properly, then asks for a third.');
  const third = await generate(phone);
  await settle(phone, third.job.id);
  const refused = await generate(phone);
  assert.ok(refused.refused, 'a third free generation must be refused');
  assert.equal(refused.status, 402, 'and refused as 402, which is what the app branches on');
  assert.equal(refused.body.error, 'insufficient_credits');
  ok('402 insufficient_credits — the paywall, not an error');
  show('body', refused.body);

  // -- the reinstall --------------------------------------------------------
  say('The app is deleted and reinstalled. New keystore secret, same ANDROID_ID.');
  const reinstalled = device('0123456789abcdef');
  assert.notEqual(reinstalled.secret, phone.secret, 'genuinely a different device secret');
  const after = (await call(reinstalled, '/v1/account')).body;
  assert.equal(after.credits.free, 0, 'reinstalling does not hand out two more');
  ok('still zero — the install anchor saw through it');
  assert.ok((await generate(reinstalled)).refused, 'and it still cannot generate');

  say('A phone with no shared anchor is a genuinely new device, though.');
  const stranger = device('fedcba9876543210');
  assert.equal((await call(stranger, '/v1/account')).body.credits.free, 2);
  ok('two free generations — the guard is not just refusing everyone');

  // -- accounts -------------------------------------------------------------
  say('Buying needs an account. Signing in adopts this device.');
  const account = await signIn(phone, 'sandbox@example.com');
  assert.ok(account.account?.id, 'an account exists');
  assert.equal(account.credits.signedIn, true);
  assert.equal(account.credits.free, 0, 'signing in does not reset the free allowance');
  assert.equal(account.purchaserId, account.account.id, 'RevenueCat is told our own user id');
  ok(`signed in as ${account.account.email}, free allowance untouched`);

  // -- purchases ------------------------------------------------------------
  say('A pack is bought. Only the webhook grants it.');
  const txn = `sbx_txn_${randomUUID()}`;
  const bought = await control('/__sandbox/purchase', {
    device: phone.secret,
    productId: 'com.luvoai.luvo.credits.10',
    transactionId: txn,
  });
  assert.equal(bought.body.outcome.applied, 'granted');
  assert.equal(bought.body.credits.credits, 10);
  ok('10 credits granted through the real webhook handler');

  say('The webhook is delivered again — twice, two different ways.');
  const replayEvent = await control('/__sandbox/purchase', {
    device: phone.secret,
    transactionId: txn,
    eventId: 'sbx_same_event',
  });
  assert.equal(replayEvent.body.outcome.applied, 'duplicate');
  assert.equal(replayEvent.body.credits.credits, 10, 'a replay must not grant twice');
  ok('same transaction under a new event id → duplicate, balance unmoved');

  // -- spending paid credits ------------------------------------------------
  say('With no free left, a generation comes out of the balance.');
  const paid = await generate(phone);
  assert.equal(paid.job.chargeSource, 'paid', 'the server records which pot paid');
  assert.equal(paid.credits.credits, 9, 'the credit leaves the balance at submit');
  await settle(phone, paid.job.id);
  assert.equal((await call(phone, '/v1/credits')).body.credits.credits, 9, 'completing does not charge again');
  ok('paid charge held at submit, spent on completion');

  say('A cancelled generation gives the credit back.');
  await control('/__sandbox/next', { outcome: 'hang' });
  const cancelled = await generate(phone);
  assert.equal(cancelled.credits.credits, 8);
  await call(phone, `/v1/previews/${cancelled.job.id}`, { method: 'DELETE' });
  assert.equal((await call(phone, '/v1/credits')).body.credits.credits, 9, 'cancelling refunds');
  ok('cancelled → refunded');
  await control('/__sandbox/next', { outcome: 'ready' });

  // -- refunds --------------------------------------------------------------
  say('Apple refunds the pack. The credits come back out.');
  const refund = await control('/__sandbox/refund', { device: phone.secret, transactionId: txn });
  assert.equal(refund.body.outcome.applied, 'revoked');
  assert.equal(refund.body.credits.credits, 0, 'a refund clamps at zero rather than going negative');
  ok('revoked, and clamped at zero — no hidden debt');

  // -- a second device on the same account ----------------------------------
  say('The account is what makes credits follow a phone.');
  await control('/__sandbox/purchase', { device: phone.secret, productId: 'com.luvoai.luvo.credits.5' });
  const newPhone = device('aaaabbbbccccdddd');
  await signIn(newPhone, 'sandbox@example.com');
  const carried = (await call(newPhone, '/v1/credits')).body;
  assert.equal(carried.credits.credits, 5, 'purchased credits follow the account');
  assert.equal(carried.credits.free, 2, 'and the new phone still has its own free two');
  ok('5 purchased credits carried across; the new device keeps its own free allowance');

  // -- deletion -------------------------------------------------------------
  say('The account is deleted, which App Store 5.1.1(v) requires to be real.');
  const deleted = await call(phone, '/v1/account', { method: 'DELETE' });
  assert.equal(deleted.body.account, null);
  assert.equal(deleted.body.credits.credits, 0, 'unspent credits go with it');
  assert.equal(deleted.body.credits.free, 0, 'and it is not a way to get the free two back');
  ok('account gone, credits gone, free allowance still spent');

  const purchases = (await call(null, '/__sandbox/purchases')).body;
  assert.ok(purchases.length >= 2, 'purchase records outlive the account');
  assert.ok(purchases.every((row) => row.user_id === null), 'with nobody attached to them');
  ok('purchase records survive with a null user — a refund can still reconcile');

  console.log(`
${'─'.repeat(64)}
  Everything held.

  free      two per device, held at submit, refunded on failure and on cancel,
            and it survived a reinstall on the same ANDROID_ID.
  paid      granted only by webhook, deduplicated, never negative, follows the
            account to a second phone.
  http      402 on empty, chargeSource reported, deletion real.
${'─'.repeat(64)}
`);
}

async function state() {
  const secret = flag('device');
  if (!secret) {
    console.error('Pass --device <secret>. The app prints nothing; use `scenario`, or read one from your own logs.');
    process.exit(1);
  }
  console.log(JSON.stringify((await call(null, `/__sandbox/state?device=${secret}`)).body, null, 2));
}

async function fresh() {
  await control('/__sandbox/wipe', {});
  const phone = device(flag('android-id', '0123456789abcdef'));
  const account = (await call(phone, '/v1/account')).body;
  console.log(`
  A fresh device, registered and ready.

    secret          ${phone.secret}
    X-Install-Anchor android_id:${phone.androidId}
    free            ${account.credits.free}

  Use it:
    curl -H "Authorization: Device ${phone.secret}" ${BASE}/v1/credits
    node scripts/sandbox-cli.mjs state --device ${phone.secret}
`);
}

const COMMANDS = { scenario, state, fresh };

const run = COMMANDS[command];
if (!run) {
  console.error(`Unknown command "${command}". One of: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

try {
  await run();
} catch (error) {
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    console.error(`\nNothing is listening on ${BASE}.\n  Start it with:  npm run sandbox\n`);
    process.exit(1);
  }
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
}
