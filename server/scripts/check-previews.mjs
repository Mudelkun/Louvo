#!/usr/bin/env node
/**
 * The preview pipeline, end to end, without a database, a bucket or a key.
 *
 *   npm run build && node scripts/check-previews.mjs
 *
 * `check-roundtrip.mjs` guards the catalog against a field quietly not
 * surviving the trip. This one guards the two things that go wrong in a job
 * queue, and both of them are silent:
 *
 * **A photograph that outlives its job.** The whole promise of this design is
 * that the user's picture is deleted the moment the model is finished with it,
 * and the mechanism is that every terminal transition nulls the column in the
 * same statement that sets the status. That is easy to state and easy to break —
 * one new status, one new path out of `running`, and an image sits in a bucket
 * for a year with nobody looking for it. So the lifecycle is walked here and
 * `unscrubbed()` is asserted empty at the end of every branch.
 *
 * **A reference that resolves differently from the app's.** `src/reference.ts`
 * is a hand-written mirror of `variantCandidates()` and `mannequinViews()`, and
 * the failure mode is not a crash: a strict rule that has gone lax hands the
 * model the curly render of a cut somebody asked to see straight, and the
 * preview comes back wrong rather than absent.
 *
 * It runs the real migrations, the real queue SQL and the real request builder
 * against `pg-mem`, so the claim's compare-and-set, the per-device cap and
 * the idempotency index are all genuinely exercised.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from '../../scripts/lib/catalog.mjs';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

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

// --- the compiled server, pointed at the in-memory database ----------------
process.env.DATABASE_URL ??= 'postgres://previews/local';
const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);

const jobs = await import('../dist/jobs.js');
const { resolveReference, referenceViews, variantCandidates } = await import('../dist/reference.js');
const { buildRequest } = await import('../dist/tryOn.js');
const { getCatalog, invalidateCatalog } = await import('../dist/catalog.js');

// --- a catalog to resolve against ------------------------------------------
const authored = await loadCatalog({ root: REPO_ROOT });
const { writeHairstyle, writeReferenceTables } = await import('./lib/metadata.mjs');
await writeReferenceTables(client, authored);
for (const style of authored.hairstyles) await writeHairstyle(client, style);

// A style that is genuinely offered in more than one texture, so the strict rule
// and the stand-in rule are two different answers rather than the same one.
const multi = authored.hairstyles.find(
  (style) => new Set(Object.values(style.variants).filter(Boolean)).size > 1,
);
assert.ok(multi, 'the authored catalog has no multi-variant style to check against');

const shot = Object.values(multi.variants).find(Boolean);
for (const angle of ['front', 'half', 'side', 'back']) {
  await client.query(
    `insert into renders (hairstyle_id, variant_id, length_id, gender, angle, url, mask_url, width, height, bytes, mask_bytes, source_checksum)
     values ($1, $2, 'medium', 'male', $3, $4, null, 600, 597, 17000, 0, 'deadbeef')`,
    [multi.id, shot, angle, `https://cdn.test/${multi.id}/${shot}/${angle}.webp`],
  );
}
invalidateCatalog();
const catalog = await getCatalog();

// --- the matrix, read the same way the app reads it ------------------------
// Mirrors `variantCandidates()` in src/lib/hairTypes.ts: a declared type matches
// its own variant or nothing at all, and "All Types" accepts every render the
// cut has.
for (const type of ['straight', 'wavy', 'curly', 'coily']) {
  const declared = multi.variants[type];
  assert.deepEqual(
    variantCandidates(multi, type),
    declared ? [declared] : [],
    `${multi.id}: a declared ${type} must resolve to exactly its own variant`,
  );
}
assert.ok(variantCandidates(multi, null).length > 1, 'All Types must offer every variant of a multi-variant cut');

// The one deliberate divergence from the app, and the reason it exists: only
// one variant has actually been shot, so a user who declared a different type
// still gets a reference — the geometry of the cut — rather than a name-only
// prompt that reliably returns the photograph unchanged.
const strictType = ['straight', 'wavy', 'curly', 'coily'].find(
  (type) => multi.variants[type] && multi.variants[type] !== shot,
);
if (strictType) {
  const standIn = resolveReference(catalog, multi, 'male', strictType);
  assert.ok(standIn, 'an ungenerated variant must fall back to another shot of the same cut');
  assert.equal(standIn.variant, shot, 'the stand-in is a different variant of the same hairstyle');
}

// One reference image, and it is the hero. See REFERENCE_VIEWS — five images in
// the request is the measured failure, not a tuning choice.
const reference = resolveReference(catalog, multi, 'male', null);
assert.ok(reference, 'the seeded style must resolve a reference');
const views = referenceViews(reference);
assert.equal(views.length, 1, 'exactly one reference view is sent');
assert.equal(views[0].angle, 'half', 'the reference is the hero angle');

// --- the lifecycle ---------------------------------------------------------
const secret = 'check-previews-device-secret-0000000000';
const { deviceIdFor, touchDevice } = await import('../dist/devices.js');
const deviceId = deviceIdFor(secret);
await touchDevice(deviceId);
await touchDevice(deviceId); // the upsert must be safe to repeat

const id = jobs.newJobId();
const key = jobs.photoKey(id);
const created = await jobs.createJob({
  id,
  deviceId,
  hairstyleId: multi.id,
  gender: 'male',
  hairType: null,
  lengthId: null,
  colorId: null,
  photoWidth: 1170,
  photoHeight: 2532,
  photoKey: key,
  idempotencyKey: 'idem-1',
});
assert.equal(created.status, 'awaiting_upload', 'a new job waits for its photograph');

// The retry that must not become a second charge.
const replayed = await jobs.createJob({
  ...created,
  id: jobs.newJobId(),
  deviceId,
  hairstyleId: multi.id,
  gender: 'male',
  hairType: null,
  lengthId: null,
  colorId: null,
  photoWidth: 1170,
  photoHeight: 2532,
  photoKey: jobs.photoKey('other'),
  idempotencyKey: 'idem-1',
});
assert.equal(replayed.id, created.id, 'a replayed submit returns the original job, not a second one');

// Nothing is claimable until the upload lands.
assert.equal(await jobs.claimNext(jobs.leaseFor(60), 1), null, 'an unuploaded job must not be claimable');
await jobs.markUploaded(created.id);

// A second job for the same device, to prove the per-device cap.
const second = jobs.newJobId();
await jobs.createJob({
  id: second,
  deviceId,
  hairstyleId: multi.id,
  gender: 'male',
  hairType: null,
  lengthId: null,
  colorId: null,
  photoWidth: 1170,
  photoHeight: 2532,
  photoKey: jobs.photoKey(second),
  idempotencyKey: null,
});
await jobs.markUploaded(second);

const claimed = await jobs.claimNext(jobs.leaseFor(60), 1);
assert.ok(claimed, 'an uploaded job must be claimable');
assert.equal(claimed.id, created.id, 'the oldest job goes first');
assert.equal(claimed.attempts, 1, 'claiming counts as an attempt — attempts are money');
assert.equal(
  await jobs.claimNext(jobs.leaseFor(60), 1),
  null,
  'one device may not hold two of ten concurrency slots',
);

// --- the request the worker would send -------------------------------------
const built = buildRequest({
  catalog,
  job: claimed,
  photoUrl: 'https://transient.test/in/photo.jpg',
});
assert.equal(built.input.image_urls.length, 2, 'two images: the photograph and one reference');
assert.equal(built.input.image_urls[0], 'https://transient.test/in/photo.jpg', 'the photograph goes first');
assert.match(built.input.image_urls[1], /\/half\.webp$/, 'the reference is the hero render');
assert.ok(built.input.prompt.includes(multi.name), 'the prompt names the cut as a label on the reference');
assert.match(built.input.prompt, /original hair colour/i, 'the prompt keeps the subject\'s own colour');
// `match` sizing: the photo is portrait, so the frame must be too.
assert.ok(built.input.image_size.height > built.input.image_size.width, 'the output keeps the photo\'s shape');

// --- settling, and the scrub -----------------------------------------------
await jobs.markSubmitted(claimed.id, {
  requestId: 'req-1',
  statusUrl: 'https://queue.fal.run/x/requests/req-1/status',
  responseUrl: 'https://queue.fal.run/x/requests/req-1',
  model: built.model,
  variant: built.variant,
  views: built.views,
  leaseUntil: jobs.leaseFor(60),
});
assert.equal((await jobs.countRunning()), 1, 'one generation is in flight');

await jobs.markReady(claimed.id, {
  resultKey: jobs.resultKey(claimed.id),
  width: 1248,
  height: 1664,
  expiresAt: jobs.retentionDeadline(),
});
const ready = await jobs.getJob(claimed.id);
assert.equal(ready.status, 'ready');
assert.equal(ready.photo_key, null, 'the photograph is released the moment the model is done with it');
assert.ok(ready.result_key, 'the preview is waiting to be collected');
assert.ok(ready.expires_at > new Date(), 'the hand-off window is in the future');

await jobs.markCollected(claimed.id);
const collected = await jobs.getJob(claimed.id);
assert.equal(collected.status, 'collected');
assert.equal(collected.result_key, null, 'collecting deletes our copy — the phone is where it lives now');
assert.equal(collected.expires_at, null, 'nothing left to expire');

// The other job, down the failure path.
const failing = await jobs.claimNext(jobs.leaseFor(60), 1);
assert.ok(failing, 'the second job becomes claimable once the first has settled');
await jobs.markFailed(failing.id, 'the generator rejected the request', 'fal_400');
const failed = await jobs.getJob(failing.id);
assert.equal(failed.photo_key, null, 'a failed job releases the photograph too');
assert.equal(failed.error_code, 'fal_400');

// And the cancel path.
const third = jobs.newJobId();
await jobs.createJob({
  id: third,
  deviceId,
  hairstyleId: multi.id,
  gender: 'male',
  hairType: null,
  lengthId: null,
  colorId: null,
  photoWidth: 800,
  photoHeight: 800,
  photoKey: jobs.photoKey(third),
  idempotencyKey: null,
});
await jobs.markCancelled(third);
const cancelled = await jobs.getJob(third);
assert.equal(cancelled.photo_key, null, 'cancelling releases the photograph immediately');

// The invariant the whole design rests on.
assert.deepEqual(
  await jobs.unscrubbed(),
  [],
  'no settled job may still name an object — see the scrub note in src/jobs.ts',
);

// A settled job is still listable, so the app can show what happened.
const listed = await jobs.listJobs(deviceId, 20);
assert.ok(
  listed.some((job) => job.id === failing.id),
  'a failed job stays in the list so the tile can offer a retry',
);
assert.ok(
  !listed.some((job) => job.id === claimed.id),
  'a collected job leaves the list — it is a saved look now, not a job',
);
// The regression that made cancelling look broken: a cancelled job kept being
// returned, the app did not recognise the id, and it adopted it as a fresh
// in-flight tile. Cancel, refresh, and it was back at 5% forever.
assert.ok(
  !listed.some((job) => job.id === third),
  'a cancelled job leaves the list — otherwise the client re-adopts it as a new job',
);

console.log('Preview pipeline clean.');
console.log('  matrix: strict for a declared type, stand-in reference for an ungenerated one.');
console.log('  request: 2 images, photograph first, hero reference, photo-shaped output.');
console.log('  queue: idempotent submit, oldest first, one slot per device, compare-and-set claim.');
console.log('  scrub: photograph released on ready/failed/cancelled, result released on collect.');
await client.end();
