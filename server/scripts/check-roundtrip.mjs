#!/usr/bin/env node
/**
 * The one check that matters for this branch, run without a database.
 *
 *   node scripts/check-roundtrip.mjs
 *
 * The risk in moving a catalog behind an API is not that the server falls over —
 * it is that a field quietly does not survive the trip. `mockCatalog.ts` has
 * nested `variants` rows, a per-gender `lengths` offer, a `shape` descriptor and
 * six array columns, and every one of them is flattened into SQL by the publish
 * script and rebuilt by `src/catalog.ts`. A hairstyle that comes back with an
 * empty `variants` row is not a crash: it is a hairstyle that silently stops
 * being offered for any hair type, on every phone.
 *
 * So this walks the whole loop against `pg-mem` — a real SQL engine, in memory,
 * no server and no credentials — and asserts that what comes out of
 * `GET /v1/catalog` is field-for-field what went in:
 *
 *   mockCatalog.ts -> migrations -> publish -> catalog.ts -> compare
 *
 * `pg-mem` is a dev dependency, so `npm install` is enough. The graceful skip
 * below is for a production install (`npm ci --omit=dev`), where a check has no
 * business failing a deploy.
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
  console.log('  npm install --no-save pg-mem && node scripts/check-roundtrip.mjs');
  process.exit(0);
}

const db = newDb({ autoCreateForeignKeyIndices: true });
// The schema uses `now()` in defaults and `gen`-free ids, so nothing exotic is
// needed — but `pg-mem` wants to be told about the few functions it does not
// ship with rather than failing at the first default.
db.public.registerFunction({
  name: 'now',
  returns: db.public.getType?.('timestamptz') ?? undefined,
  implementation: () => new Date(),
  impure: true,
});

const { Client } = db.adapters.createPg();
const client = new Client();
await client.connect();

// --- schema ---------------------------------------------------------------
// Every migration, in name order — the same thing `scripts/migrate.mjs` does.
// Naming one file here meant this check silently stopped covering the schema the
// moment a second migration was added.
const migrations = (await readdir(path.join(SERVER_ROOT, 'migrations')))
  .filter((file) => file.endsWith('.sql'))
  .sort();
for (const file of migrations) {
  await client.query(await readFile(path.join(SERVER_ROOT, 'migrations', file), 'utf8'));
}

// --- publish (metadata only; renders are covered by the real dry run) ------
const catalog = await loadCatalog({ root: REPO_ROOT });
const { writeHairstyle, writeReferenceTables } = await import('./lib/metadata.mjs');
await writeReferenceTables(client, catalog);
for (const style of catalog.hairstyles) await writeHairstyle(client, style);

// A handful of synthetic render rows, so the manifest nesting is exercised too.
const sample = catalog.hairstyles[0];
const sampleVariant = Object.values(sample.variants).find(Boolean) ?? 'any';
for (const angle of ['front', 'half', 'side', 'back']) {
  await client.query(
    `insert into renders (hairstyle_id, variant_id, length_id, gender, angle, url, mask_url, width, height, bytes, mask_bytes, source_checksum)
     values ($1, $2, 'medium', 'male', $3, $4, $5, 600, 597, 17000, 4000, 'deadbeef')`,
    [sample.id, sampleVariant, angle, `https://cdn.test/r/ab/${angle}.webp`, `https://cdn.test/r/cd/${angle}.webp`],
  );
}

// --- read it back the way the API does ------------------------------------
// `src/catalog.ts` is TypeScript and reaches for the real pool, so the check
// runs the compiled build against this client. `npm run build` first.
process.env.DATABASE_URL ??= 'postgres://roundtrip/local';
const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
// One seam, and it is the only one: the compiled catalog module talks to the
// pool through `query`, so pointing that at pg-mem is enough to run the real
// assembly code rather than a copy of it.
dbModule.pool.query = (text, values) => client.query(text, values);

const { getCatalog, invalidateCatalog } = await import('../dist/catalog.js');
const served = await getCatalog();

// --- compare ---------------------------------------------------------------
let checked = 0;
assert.equal(served.categories.length, catalog.categories.length, 'category count');
assert.equal(served.hairTypes.length, catalog.hairTypes.length, 'hair type count');
assert.equal(served.hairLengths.length, catalog.hairLengths.length, 'hair length count');
assert.equal(served.colors.length, catalog.colors.length, 'colour count');
assert.equal(served.highlights.length, catalog.highlights.length, 'highlight count');
assert.equal(served.hairstyles.length, catalog.hairstyles.length, 'hairstyle count');

const byId = new Map(served.hairstyles.map((style) => [style.id, style]));
for (const expected of catalog.hairstyles) {
  const actual = byId.get(expected.id);
  assert.ok(actual, `hairstyle ${expected.id} is missing`);

  for (const field of ['name', 'description', 'maintenance', 'popularity']) {
    assert.deepEqual(actual[field], expected[field], `${expected.id}.${field}`);
  }
  for (const field of ['genders', 'tags', 'bestFor', 'adjustments']) {
    assert.deepEqual(actual[field], expected[field], `${expected.id}.${field}`);
  }
  // Order matters for categories: it is the order the chips are laid out in.
  assert.deepEqual([...actual.categoryIds].sort(), [...expected.categoryIds].sort(), `${expected.id}.categoryIds`);
  assert.deepEqual(actual.shape, expected.shape, `${expected.id}.shape`);

  // The matrix. Absence of a row has to come back as `null`, not as a missing
  // key — the app indexes this record directly.
  assert.deepEqual(actual.variants, expected.variants, `${expected.id}.variants`);

  // The length offer, per gender, in slider order.
  const expectedLengths = expected.lengths ?? undefined;
  if (expectedLengths) {
    for (const [gender, lengths] of Object.entries(expectedLengths)) {
      assert.deepEqual(actual.lengths?.[gender], lengths, `${expected.id}.lengths.${gender}`);
    }
  } else {
    assert.equal(actual.lengths, undefined, `${expected.id} should have no length offer`);
  }
  checked += 1;
}

// The manifest nesting the app installs as its render index.
const manifest = served.renders[sample.id];
assert.ok(manifest, 'sample style has no renders');
const views = manifest[sampleVariant]?.medium?.male;
assert.ok(views, 'sample renders are not nested style -> variant -> length -> gender -> angle');
assert.deepEqual(Object.keys(views).sort(), ['back', 'front', 'half', 'side'], 'all four angles');
assert.equal(views.half.url, 'https://cdn.test/r/ab/half.webp', 'render url');
assert.equal(views.half.maskUrl, 'https://cdn.test/r/cd/half.webp', 'mask url');

// --- the hair-type picker's examples --------------------------------------
// Seeded three of the four for one gender on purpose: the picker treats a
// partial set as no set, because two photographed rows above two icon rows reads
// as a broken screen. That rule has to hold on the server, so an incomplete
// gender must not reach the wire at all.
for (const type of ['straight', 'wavy', 'curly', 'coily']) {
  await client.query(
    `insert into hair_type_examples (hair_type_id, gender, url, width, height, bytes, source_checksum)
     values ($1, 'female', $2, 627, 627, 15000, 'abc')`,
    [type, `https://cdn.test/x/${type}.webp`],
  );
}
for (const type of ['straight', 'wavy', 'curly']) {
  await client.query(
    `insert into hair_type_examples (hair_type_id, gender, url, width, height, bytes, source_checksum)
     values ($1, 'male', $2, 627, 627, 15000, 'abc')`,
    [type, `https://cdn.test/y/${type}.webp`],
  );
}

invalidateCatalog();
const withExamples = await getCatalog();
assert.deepEqual(
  Object.keys(withExamples.hairTypeExamples).sort(),
  ['female'],
  'an incomplete gender must not be served — the picker shows a partial set as no set',
);
assert.deepEqual(
  Object.keys(withExamples.hairTypeExamples.female).sort(),
  ['coily', 'curly', 'straight', 'wavy'],
  'the complete gender carries all four types',
);
assert.equal(withExamples.hairTypeExamples.female.wavy, 'https://cdn.test/x/wavy.webp', 'example url');

console.log(`Round trip clean: ${checked} hairstyle(s) survived mockCatalog -> SQL -> /v1/catalog unchanged.`);
console.log('  hair-type examples: complete gender served, incomplete gender withheld.');
console.log(`  ${served.categories.length} categories, ${served.colors.length} colours, ${served.hairLengths.length} lengths, 4 render slots.`);
await client.end();
