#!/usr/bin/env node
/**
 * The anonymous ceiling and the sign-in bonus, without a database or a browser.
 *
 *   npm run build && node scripts/check-anon.mjs
 *
 * `check-credits.mjs` guards the four silent failures of a ledger. This one
 * guards the four of a free tier that is given away before anybody is asked for
 * anything, and every one of them is a bug that either costs money quietly or
 * refuses somebody their first look at the product:
 *
 * **A browser handed the phone's allowance.** The two anchors are not equally
 * strong — a keystore survives a reinstall and `localStorage` does not survive a
 * menu item — so a browser is granted fewer. If the anchor kind stops being
 * carried through, browsers silently get the larger number.
 *
 * **A ceiling that two simultaneous requests both pass.** The cap is enforced by
 * compare-and-set for the same reason the queue claims rows with one. A check
 * followed by an update would let two submissions arriving together both see
 * "nothing used yet" against a cap of one.
 *
 * **A claim consumed by a generation that never happened.** The ceiling is taken
 * before the job exists; if the charge then loses the race for the last credit,
 * the claim has to come back or the bucket pays for a preview nobody got.
 *
 * **A welcome credit granted twice.** Signing in is a route anybody can call
 * repeatedly — a double-tapped button, two tabs, a retried request after a
 * dropped response. The grant is a compare-and-set on `signup_bonus_granted_at`,
 * and this asserts the second call is a no-op rather than a second credit.
 *
 * It also asserts the property that keeps this a rate limit rather than a
 * fingerprint: two devices of *different* classes behind one IP land in
 * different buckets, so a household is not one allowance.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let newDb;
try {
  ({ newDb } = await import('pg-mem'));
} catch {
  console.log('pg-mem is not installed — skipping.');
  process.exit(0);
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

process.env.DATABASE_URL ??= 'postgres://anon/local';
// Set before the compiled `env.ts` is first imported, since it reads the
// environment once at module load. Small numbers so the assertions below are
// about the mechanism rather than about arithmetic.
process.env.WEB_FREE_GENERATIONS ??= '1';
process.env.FREE_GENERATIONS ??= '2';
process.env.SIGNUP_BONUS_CREDITS ??= '1';
process.env.ANON_MAX_PER_BUCKET ??= '3';
process.env.ANON_ALERT_DEVICES ??= '5';

const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);
dbModule.pool.connect = async () => ({
  query: (text, values) => client.query(text, values),
  release: () => undefined,
});

const abuse = await import('../dist/abuse.js');
const anchors = await import('../dist/anchors.js');
const credits = await import('../dist/credits.js');
const accounts = await import('../dist/accounts.js');
const { deviceIdFor, deviceKindFor, touchDevice } = await import('../dist/devices.js');

const sql = (text, values = []) => client.query(text, values).then((r) => r.rows);

// ---------------------------------------------------------------------------
// A browser is not a phone
// ---------------------------------------------------------------------------

// The signal, first: a browser sets `Origin` and cannot suppress it; the app
// does not send one. This is what decides which anchor kind is written, so if it
// ever stops being true the allowance difference below silently disappears.
assert.equal(deviceKindFor('https://louvo.app', undefined), 'web');
assert.equal(deviceKindFor(undefined, 'web'), 'web', 'the explicit header works for a same-origin deployment');
assert.equal(deviceKindFor(undefined, undefined), 'device', 'and a native client is the default');

const browser = deviceIdFor('b'.repeat(43));
await touchDevice(browser);
await anchors.registerAnchors(browser, anchors.anchorsFrom(browser, undefined, 'web'));

const phone = deviceIdFor('p'.repeat(43));
await touchDevice(phone);
await anchors.registerAnchors(phone, anchors.anchorsFrom(phone, undefined, 'device'));

assert.equal((await credits.creditState(browser)).free, 1, 'a browser is granted one free generation');
assert.equal((await credits.creditState(phone)).free, 2, 'a phone keeps its two');

// The grant is read once, when the row is inserted. Re-registering must not
// re-read it — otherwise changing the configuration would retroactively take a
// generation away from somebody who already had it.
await anchors.registerAnchors(browser, anchors.anchorsFrom(browser, undefined, 'web'));
assert.equal((await credits.creditState(browser)).free, 1, 're-registering does not re-grant');

// ---------------------------------------------------------------------------
// The bucket is a network *and* a device class
// ---------------------------------------------------------------------------

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const home = { ip: '81.2.69.142', language: 'en-GB,en;q=0.9' };
const flatmateA = { ...home, userAgent: IPHONE };
const flatmateB = { ...home, userAgent: WINDOWS };

assert.notEqual(
  abuse.bucketIdFor(flatmateA),
  abuse.bucketIdFor(flatmateB),
  'two people on one router, on different devices, are two buckets — a household is not one allowance',
);
assert.equal(
  abuse.bucketIdFor(flatmateA),
  abuse.bucketIdFor({ ...flatmateA }),
  'and the same browser on the same network is the same bucket',
);

// The raw user-agent is never the key. Two iPhones on the same iOS major
// version collide deliberately: the class is the browser and OS family plus a
// major version, which is not enough to recognise a person. That collision is
// the accepted false positive, and it costs a sign-in rather than a preview.
assert.equal(abuse.deviceClass(IPHONE), 'safari17/ios17');
assert.equal(abuse.deviceClass(WINDOWS), 'chrome126/windows10');
assert.equal(abuse.deviceClass(undefined), 'other/other', 'a missing user-agent is a class, not a crash');

// IPv6 is bucketed by /64: a single machine is routinely handed a whole range
// and rotates through it, so per-address buckets would be free to defeat.
assert.equal(abuse.networkKey('2a00:1450:4009:81f::200e'), '2a00:1450:4009:81f');
assert.equal(abuse.networkKey('::ffff:81.2.69.142'), '81.2.69.142', 'and a v4-mapped address is its v4 self');

// ---------------------------------------------------------------------------
// The ceiling
// ---------------------------------------------------------------------------

const cap = 3;
const seen = [];
for (let i = 0; i < cap; i += 1) {
  const decision = await abuse.claimAnonymous(flatmateA, `dev_${i}`);
  seen.push(decision);
  assert.equal(decision.allowed, true, `claim ${i + 1} of ${cap} is allowed`);
}
assert.equal(seen.at(-1).remaining, 0, 'the last allowed claim reports nothing left');

const overCap = await abuse.claimAnonymous(flatmateA, 'dev_over');
assert.equal(overCap.allowed, false, 'the claim past the cap is refused');
assert.equal(overCap.remaining, 0);

// The refusal is per bucket, not global: the flatmate on a different device is
// untouched. This is the assertion that would fail if the bucket key were ever
// narrowed to the IP alone.
assert.equal((await abuse.claimAnonymous(flatmateB, 'dev_b')).allowed, true, 'the other device class is unaffected');

// A claim released is a claim available again — the lost-race path in
// `previews.ts`, where the job is cancelled after the ceiling was taken.
await abuse.releaseAnonymous(overCap.bucketId);
assert.equal((await abuse.claimAnonymous(flatmateA, 'dev_after_release')).allowed, true, 'a released claim comes back');

// And a release with nothing to give back cannot manufacture generations.
const bucketId = abuse.bucketIdFor(flatmateA);
await sql('update anon_buckets set generations = 0 where id = $1', [bucketId]);
await abuse.releaseAnonymous(bucketId);
const [floor] = await sql('select generations from anon_buckets where id = $1', [bucketId]);
assert.equal(floor.generations, 0, 'a release floors at zero rather than going negative');

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

await sql('update anon_buckets set generations = $2 where id = $1', [bucketId, cap]);
assert.equal((await abuse.claimAnonymous(flatmateA, 'dev_x')).allowed, false, 'spent, before the window rolls');

// Age the window past its length. The rollover is done by the same call that
// reads it, so there is no sweeper to run and nothing to wait for.
await sql('update anon_buckets set window_start = $2 where id = $1', [bucketId, new Date(Date.now() - 172_800_000)]);
const fresh = await abuse.claimAnonymous(flatmateA, 'dev_y');
assert.equal(fresh.allowed, true, 'a new window is a new allowance');
assert.equal(fresh.devices, 1, 'and it does not inherit the previous window’s devices');

const [rolled] = await sql('select first_seen_at, alerted_at from anon_buckets where id = $1', [bucketId]);
assert.equal(rolled.alerted_at, null, 'the alert re-arms with the window');
assert.ok(rolled.first_seen_at, 'but first_seen_at survives it, so an alert can say how old the bucket is');

// ---------------------------------------------------------------------------
// The alert
// ---------------------------------------------------------------------------

// Distinct devices, not requests: the same device asking twice is one person,
// and that distinction is the whole signal. Generations are already capped, so
// what is being watched is a bucket minting more identities than it can use.
const loop = { ip: '203.0.113.7', userAgent: WINDOWS, language: 'en-US' };
let last;
for (let i = 0; i < 6; i += 1) last = await abuse.claimAnonymous(loop, `loop_${i}`);
assert.equal(last.devices, 6, 'six distinct device secrets from one bucket');

const repeat = await abuse.claimAnonymous(loop, 'loop_0');
assert.equal(repeat.devices, 6, 'and asking again from a device already seen is not a seventh');

// `reportIfSuspicious` returns whether it *sent*, which with no ABUSE_ALERT_EMAIL
// configured is always false — so the claim on `alerted_at` is asserted directly.
// That is the part that has to be exactly-once: two racing requests must not
// produce two emails.
const claimedAlert = await sql(
  `update anon_buckets set alerted_at = now() where id = $1 and alerted_at is null returning id`,
  [abuse.bucketIdFor(loop)],
);
assert.equal(claimedAlert.length, 1, 'the first request to notice claims the alert');
const secondAlert = await sql(
  `update anon_buckets set alerted_at = now() where id = $1 and alerted_at is null returning id`,
  [abuse.bucketIdFor(loop)],
);
assert.equal(secondAlert.length, 0, 'and the second gets nothing, so one bucket is one email per window');

// ---------------------------------------------------------------------------
// Clerk is a provider, not a second sign-in system
// ---------------------------------------------------------------------------

// The whole of the web integration on this side is that `clerk` is a value in
// this list and a branch in `verifyIdentity`. If it ever stops being one of
// these, `/v1/account/sign-in` answers 400 `invalid_request` to every browser
// sign-in — which reads as the dialog being broken rather than as a provider
// having been dropped.
assert.ok(accounts.PROVIDERS.includes('clerk'), 'clerk is one of the providers the route accepts');

// With no issuer configured it refuses rather than accepting a token it cannot
// verify. That is the only safe direction for an auth setting to fail in, and it
// is asserted because the alternative — verifying against whatever JWKS a token
// names — is the classic way this kind of code goes wrong.
await assert.rejects(
  () => accounts.verifyIdentity({ provider: 'clerk', token: 'not.a.token' }),
  (error) => {
    assert.equal(error.code, 'clerk_unconfigured');
    assert.equal(error.status, 503);
    return true;
  },
  'a deployment with no CLERK_ISSUER refuses a Clerk sign-in',
);

// ---------------------------------------------------------------------------
// The welcome credit
// ---------------------------------------------------------------------------

const identity = { provider: 'clerk', subject: 'user_2abc', email: 'someone@example.com' };
const { userId, created } = await accounts.upsertAccount(identity, null);
assert.equal(created, true);
await accounts.adoptDevice(browser, userId);

assert.equal(await credits.grantSignupBonus(userId), true, 'signing in grants the welcome credit');
assert.equal(await credits.balanceFor(userId), 1);

assert.equal(await credits.grantSignupBonus(userId), false, 'a second sign-in grants nothing');
assert.equal(await credits.balanceFor(userId), 1, 'and the balance is unmoved');

// Signing in again through the same identity must not create a second account,
// which would be a second bonus by another route.
const again = await accounts.upsertAccount(identity, null);
assert.equal(again.userId, userId);
assert.equal(again.created, false);
assert.equal(await credits.grantSignupBonus(again.userId), false);
assert.equal(await credits.balanceFor(userId), 1);

// It is recorded as `bonus`, which is the reason `006` widened the domain: as
// `free` it would inflate the allowance the anchors actually granted, and as
// `paid` it would be revenue that was never received.
const [ledger] = await sql(
  "select source, delta, kind from credit_ledger where user_id = $1 and kind = 'grant' order by id desc limit 1",
  [userId],
);
assert.equal(ledger.source, 'bonus');
assert.equal(ledger.delta, 1);

// The whole point of the tier, asserted as one number: a browser that has not
// spent its anonymous preview has two after signing in.
const afterSignIn = await credits.creditState(browser);
assert.equal(afterSignIn.free, 1, 'the unspent anonymous generation is still there');
assert.equal(afterSignIn.credits, 1, 'beside the welcome credit');
assert.equal(afterSignIn.total, 2, 'which is two in total, reached without asking for anything up front');
assert.equal(afterSignIn.signedIn, true);

console.log('Anonymous tier clean.');
console.log('  allowance: one free in a browser, two on a phone, granted once and never re-granted.');
console.log('  buckets: one IP and one device class, so a household is several buckets and not one.');
console.log('  ceiling: compare-and-set at the cap, released on a lost race, re-armed with the window.');
console.log('  alerts: distinct devices rather than requests, claimed once per bucket per window.');
console.log('  bonus: granted once per account, recorded as bonus, one plus one makes two.');
console.log('  clerk: a fourth provider on the same route, refusing rather than guessing unconfigured.');
await client.end();
