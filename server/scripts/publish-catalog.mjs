#!/usr/bin/env node
/**
 * Publishes the catalog: metadata into Postgres, imagery into R2.
 *
 * This is the command the whole architecture exists for. `project.md` asks that
 * "new hairstyles and mannequin images can be added or replaced easily without
 * requiring an app update", and this is what makes that sentence true — a
 * hairstyle reaches every phone by running this, not by shipping a binary.
 *
 *   node scripts/publish-catalog.mjs --dry-run     # free, no network, no writes
 *   node scripts/publish-catalog.mjs               # the real thing
 *   node scripts/publish-catalog.mjs --style afro  # one hairstyle
 *
 * It is **idempotent and cheap to re-run**. Object keys are the SHA-256 of the
 * transcoded bytes, so an unchanged render is an object that already exists and
 * is skipped without being uploaded; and each row remembers the checksum of the
 * *source* PNG, so an unchanged render is not even transcoded. A second run over
 * an unchanged catalog does a handful of selects and stops.
 *
 * Where the data comes from is deliberately the same place the generators read:
 * `loadCatalog()` from `scripts/lib/catalog.mjs`, which transpiles
 * `src/api/mockCatalog.ts`. That file is the *authoring* format. After the first
 * publish the database is what the app reads, but the catalog is still written
 * and reviewed as a TypeScript table, which is the format it is actually good
 * in. Set `CATALOG_URL` to publish from a live catalog instead.
 *
 * Flags:
 *   --dry-run          transcode and report; upload nothing, write nothing
 *   --metadata-only    upsert metadata and leave the renders alone
 *   --style <id>       only this hairstyle (implies no unpublish sweep)
 *   --force            re-transcode and re-upload even when the checksum matches
 *   --quality <n>      WebP quality for renders (default 80)
 *   --concurrency <n>  parallel transcode + upload (default 6)
 *   --out <dir>        render directory (default ../assets/mannequins)
 *   --examples <dir>   hair-type example directory (default ../assets/hair-types)
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { loadCatalog } from '../../scripts/lib/catalog.mjs';
import { scanExamples } from '../../scripts/lib/hairTypeExamples.mjs';
import { maskFileFor, scanRenders } from '../../scripts/lib/renders.mjs';
import { loadEnv } from './lib/env.mjs';
import { unpublishMissing, writeHairstyle, writeReferenceTables } from './lib/metadata.mjs';
import { encodeMask, encodeRender, objectKey, sha256 } from './lib/media.mjs';
import { storageFromEnv } from './lib/r2.mjs';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
loadEnv(SERVER_ROOT);

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const options = {
  dryRun: flag('dry-run'),
  metadataOnly: flag('metadata-only'),
  force: flag('force'),
  style: value('style', null),
  quality: Number.parseInt(value('quality', '80'), 10),
  concurrency: Math.max(1, Number.parseInt(value('concurrency', '6'), 10)),
  out: path.resolve(REPO_ROOT, value('out', path.join('assets', 'mannequins'))),
  // The picker's examples are a separate generation living in a separate
  // directory, so they get their own flag rather than being assumed to sit
  // beside the renders — after the sources moved out of the repo they do not.
  examples: path.resolve(REPO_ROOT, value('examples', path.join('assets', 'hair-types'))),
};

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// ---------------------------------------------------------------------------
// Renders
// ---------------------------------------------------------------------------

/** `scanRenders`'s nested map, flattened to one entry per slot. */
function slotsFrom(styles, only) {
  const slots = [];
  for (const [styleId, byVariant] of Object.entries(styles)) {
    if (only && styleId !== only) continue;
    for (const [variant, byLength] of Object.entries(byVariant)) {
      for (const [length, byGender] of Object.entries(byLength)) {
        for (const [gender, views] of Object.entries(byGender)) {
          for (const [angle, file] of Object.entries(views)) {
            slots.push({ styleId, variant, length, gender, angle, file });
          }
        }
      }
    }
  }
  return slots;
}

/**
 * Runs `worker` over `items` with a fixed number of workers in flight.
 *
 * Bounded because each task holds a decoded image in memory and opens a socket:
 * unbounded `Promise.all` over 908 slots is a few gigabytes of resident sharp
 * buffers and a bucket wondering what happened.
 */
async function pooled(items, size, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await worker(next);
  });
  await Promise.all(runners);
}

/**
 * Transcodes and uploads one slot, and returns the row to write.
 *
 * The source checksum covers the render *and* its mask, so a re-run after
 * `npm run mannequins:masks` republishes the pair rather than leaving a fresh
 * mask on disk and a stale one at the edge.
 */
async function publishSlot(slot, { storage, existing, stats }) {
  const source = await readFile(slot.file);
  const maskFile = maskFileFor(slot.file);
  const maskSource = await readFile(maskFile).catch(() => null);

  const checksum = sha256(maskSource ? Buffer.concat([source, maskSource]) : source);
  const key = `${slot.styleId}/${slot.variant}/${slot.length}/${slot.gender}/${slot.angle}`;

  if (!options.force && existing.get(key) === checksum) {
    stats.unchanged += 1;
    return null;
  }

  const render = await encodeRender(source, { quality: options.quality });
  const mask = maskSource ? await encodeMask(maskSource) : null;

  stats.sourceBytes += source.length + (maskSource?.length ?? 0);
  stats.publishedBytes += render.body.length + (mask?.body.length ?? 0);
  stats.transcoded += 1;
  if (!mask) stats.maskless += 1;

  const renderKey = objectKey(render.hash);
  const maskKey = mask ? objectKey(mask.hash) : null;

  if (!options.dryRun) {
    // The key is the content hash, so "already there" means byte-identical and
    // re-uploading would be a no-op that costs a request and a megabyte.
    for (const [objKey, image] of [
      [renderKey, render],
      [maskKey, mask],
    ]) {
      if (!objKey) continue;
      if (await storage.exists(objKey)) {
        stats.alreadyUploaded += 1;
        continue;
      }
      await storage.put(objKey, image.body, { contentType: image.contentType });
      stats.uploaded += 1;
      stats.uploadedBytes += image.body.length;
    }
  }

  return {
    ...slot,
    url: storage.publicUrl(renderKey),
    maskUrl: maskKey ? storage.publicUrl(maskKey) : null,
    width: render.width,
    height: render.height,
    bytes: render.body.length,
    maskBytes: mask?.body.length ?? null,
    checksum,
  };
}

/**
 * The hair-type picker's examples: two genders x four types, no masks.
 *
 * Deliberately not folded into `publishSlot`. An example is a different kind of
 * object — it illustrates what hair *does* rather than what a haircut looks
 * like, it is never colour-graded, and so it has no mask and no variant. Sharing
 * the slot path would mean threading "does this one have a mask" through
 * everything for the sake of eight files.
 */
async function publishExample(entry, { storage, existing, stats }) {
  const source = await readFile(entry.file);
  const checksum = sha256(source);
  const key = `${entry.gender}/${entry.hairType}`;

  if (!options.force && existing.get(key) === checksum) {
    stats.unchanged += 1;
    return null;
  }

  const image = await encodeRender(source, { quality: options.quality });
  stats.sourceBytes += source.length;
  stats.publishedBytes += image.body.length;
  stats.transcoded += 1;

  const objKey = objectKey(image.hash);
  if (!options.dryRun) {
    if (await storage.exists(objKey)) {
      stats.alreadyUploaded += 1;
    } else {
      await storage.put(objKey, image.body, { contentType: image.contentType });
      stats.uploaded += 1;
      stats.uploadedBytes += image.body.length;
    }
  }

  return {
    ...entry,
    url: storage.publicUrl(objKey),
    width: image.width,
    height: image.height,
    bytes: image.body.length,
    checksum,
  };
}

async function writeExampleRow(client, row) {
  await client.query(
    `insert into hair_type_examples
       (hair_type_id, gender, url, width, height, bytes, source_checksum, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (hair_type_id, gender) do update set
       url = excluded.url, width = excluded.width, height = excluded.height,
       bytes = excluded.bytes, source_checksum = excluded.source_checksum, updated_at = now()`,
    [row.hairType, row.gender, row.url, row.width, row.height, row.bytes, row.checksum],
  );
}

async function writeRenderRow(client, row) {
  await client.query(
    `insert into renders
       (hairstyle_id, variant_id, length_id, gender, angle,
        url, mask_url, width, height, bytes, mask_bytes, source_checksum, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     on conflict (hairstyle_id, variant_id, length_id, gender, angle) do update set
       url = excluded.url, mask_url = excluded.mask_url,
       width = excluded.width, height = excluded.height,
       bytes = excluded.bytes, mask_bytes = excluded.mask_bytes,
       source_checksum = excluded.source_checksum, updated_at = now()`,
    [
      row.styleId, row.variant, row.length, row.gender, row.angle,
      row.url, row.maskUrl, row.width, row.height, row.bytes, row.maskBytes, row.checksum,
    ],
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const catalog = await loadCatalog({ root: REPO_ROOT, catalogUrl: process.env.CATALOG_URL });
const scanned = await scanRenders(options.out);
const slots = options.metadataOnly ? [] : slotsFrom(scanned, options.style);

// `scanExamples` gives `{ gender: { hairType: absolutePath } }`. Flattened here
// so the publish loop below reads the same way the render loop does. Skipped
// entirely for a `--style` run, which is about one hairstyle and has nothing to
// say about the picker.
const scannedExamples = options.metadataOnly || options.style ? {} : await scanExamples(options.examples);
const examples = Object.entries(scannedExamples).flatMap(([gender, byType]) =>
  Object.entries(byType).map(([hairType, file]) => ({ gender, hairType, file })),
);

const styles = options.style
  ? catalog.hairstyles.filter((style) => style.id === options.style)
  : catalog.hairstyles;

if (options.style && !styles.length) {
  console.error(`No hairstyle "${options.style}" in the catalog.`);
  process.exit(1);
}

console.log(
  `${options.dryRun ? 'Dry run — ' : ''}${styles.length} hairstyle(s), ${slots.length} render slot(s) ` +
    `and ${examples.length} hair-type example(s) on disk.`,
);

/**
 * Everything that has to be configured, checked before anything is done.
 *
 * All of it at once rather than at first use. A publish is a long job — the
 * transcode alone is minutes — and finding out about a missing bucket name after
 * it has been running is the worst possible moment. Reported together, too:
 * discovering four missing variables one run at a time is four rounds of
 * dashboard hunting.
 */
function preflight() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push(['DATABASE_URL', 'Railway -> Postgres -> Connect -> Public Network URL']);

  // Storage is only required when there is imagery to publish. `--metadata-only`
  // renames a hairstyle and re-orders the catalog; demanding a bucket for that
  // would block the one command you want when the bucket is not set up yet.
  if (!options.metadataOnly) {
    try {
      storageFromEnv();
    } catch (error) {
      // `storageFromEnv` already names exactly which R2 variables are absent.
      missing.push([error.message.replace(/^storage is not configured — missing /, ''), 'see server/.env.example']);
    }
  }
  return missing;
}

// A dry run must cost nothing and need no credentials: it is the command you run
// to find out what a publish would do, and the one the README tells you to try
// first. It still transcodes, because the byte counts are the interesting part.
const storage = options.dryRun
  ? {
      publicUrl: (key) => `${(process.env.R2_PUBLIC_BASE_URL ?? 'https://cdn.example').replace(/\/$/, '')}/${key}`,
      exists: async () => false,
      put: async () => {},
    }
  : null;

let client = null;
if (!options.dryRun) {
  const missing = preflight();
  if (missing.length) {
    console.error('\n  Not configured yet. Missing:\n');
    for (const [name, where] of missing) console.error(`    ${name}\n      ${where}`);
    console.error('\n  These are read from server/.env, server/.env.local or the repo root .env.local.');
    console.error('  `npm run publish:dry` needs none of them and reports what a publish would do.\n');
    process.exit(1);
  }

  client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('.railway.internal') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
}

// Resolved after the preflight so a misconfiguration is the message above rather
// than a stack trace out of the signer. A metadata-only run has no slots to
// publish, so it never reaches for storage at all.
const store = storage ?? (options.metadataOnly ? null : storageFromEnv());

const existing = new Map();
if (client && !options.force) {
  const { rows } = await client.query(
    'select hairstyle_id, variant_id, length_id, gender, angle, source_checksum from renders',
  );
  for (const row of rows) {
    existing.set(
      `${row.hairstyle_id}/${row.variant_id}/${row.length_id}/${row.gender}/${row.angle}`,
      row.source_checksum,
    );
  }
}

const existingExamples = new Map();
if (client && !options.force) {
  const { rows } = await client.query('select hair_type_id, gender, source_checksum from hair_type_examples');
  for (const row of rows) existingExamples.set(`${row.gender}/${row.hair_type_id}`, row.source_checksum);
}

const stats = {
  transcoded: 0,
  unchanged: 0,
  uploaded: 0,
  alreadyUploaded: 0,
  maskless: 0,
  sourceBytes: 0,
  publishedBytes: 0,
  uploadedBytes: 0,
};

try {
  // Metadata first, in one transaction: `renders` has a foreign key onto
  // `hairstyles`, so a brand new style has to exist before its imagery can be
  // recorded against it.
  if (client) {
    await client.query('begin');
    await writeReferenceTables(client, catalog);
    for (const style of styles) await writeHairstyle(client, style);
    const retired = options.style ? [] : await unpublishMissing(client, catalog);
    await client.query('commit');
    if (retired.length) console.log(`  unpublished (no longer in the catalog): ${retired.join(', ')}`);
  }

  const rows = [];
  await pooled(slots, options.concurrency, async (slot) => {
    const row = await publishSlot(slot, { storage: store, existing, stats });
    if (row) rows.push(row);
  });

  const exampleRows = [];
  await pooled(examples, options.concurrency, async (entry) => {
    const row = await publishExample(entry, { storage: store, existing: existingExamples, stats });
    if (row) exampleRows.push(row);
  });

  if (client && (rows.length || exampleRows.length)) {
    await client.query('begin');
    for (const row of rows) await writeRenderRow(client, row);
    for (const row of exampleRows) await writeExampleRow(client, row);
    await client.query('commit');
  }

  // The revision is bumped on every real run, including one that changed
  // nothing, and that is deliberate rather than lazy.
  //
  // It is the API's cache key: a server holds its built catalog until this
  // number moves. The metadata path above upserts unconditionally, so there is
  // no cheap way to know whether a rename actually landed — and the failure
  // mode of guessing wrong is bad in only one direction. Bumping needlessly
  // costs every server one rebuild, which is nine small selects. Not bumping
  // when something did change means a renamed hairstyle never reaches anybody,
  // with nothing to indicate why. That is exactly what `--metadata-only` used to
  // do, since it produces no render rows at all.
  if (client) {
    await client.query('update catalog_revision set revision = revision + 1, updated_at = now() where id');
  }

  console.log('');
  console.log(`  metadata      ${client ? `${styles.length} hairstyle(s) upserted` : 'skipped (dry run)'}`);
  console.log(`  examples      ${examples.length} hair-type example(s) considered`);
  console.log(`  unchanged     ${stats.unchanged} slot(s)`);
  console.log(`  transcoded    ${stats.transcoded} slot(s)`);
  if (stats.transcoded) {
    const ratio = stats.sourceBytes / Math.max(1, stats.publishedBytes);
    console.log(`                ${mb(stats.sourceBytes)} of PNG -> ${mb(stats.publishedBytes)} of WebP (${ratio.toFixed(1)}x)`);
    console.log(`                ${kb(stats.publishedBytes / stats.transcoded)} per slot, render plus mask`);
  }
  if (stats.maskless) console.log(`  no mask       ${stats.maskless} slot(s) — graded whole, run \`npm run mannequins:masks\``);
  if (options.dryRun) {
    console.log('');
    console.log('  Nothing was uploaded and nothing was written. Drop --dry-run to publish.');
  } else {
    console.log(`  uploaded      ${stats.uploaded} object(s), ${mb(stats.uploadedBytes)}`);
    console.log(`  already there ${stats.alreadyUploaded} object(s) — identical bytes, so identical keys`);
  }
} catch (error) {
  if (client) await client.query('rollback').catch(() => {});
  console.error(`\n  ! publish failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
