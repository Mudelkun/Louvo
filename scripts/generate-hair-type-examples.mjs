#!/usr/bin/env node
/**
 * Generates the hair-type picker's example imagery with fal.ai.
 *
 * Two images in the whole set — one per gender — each holding all four hair
 * types as a 2x2 grid, cut into four PNGs here. The user has already declared a
 * gender by the time the picker is shown (`app/try/gender.tsx`), so that is the
 * one axis the images vary along; the four types are the panels.
 *
 * Deliberately its own pipeline rather than a flag on the catalog generator:
 *
 *   - Different subject. The catalog photographs a *haircut*; this photographs
 *     what hair *does*, with the same plain mid-length hair in every panel so
 *     the pattern is the only variable. See lib/hairTypePrompts.mjs.
 *   - Different production. One text-to-image generation per gender instead of
 *     an edit of the approved base sheet — there is no head to hold steady
 *     across 36 styles here, there are two images.
 *   - Different afterwards. No hair masks and no colour grade: an example of a
 *     texture has no shade to be put in.
 *
 * What it does share is the object — the same blank white mannequin, material,
 * light and espresso hair as the catalog — so the picker and the catalog read as
 * one app.
 *
 * Usage:
 *
 *   node scripts/generate-hair-type-examples.mjs --dry-run
 *   node scripts/generate-hair-type-examples.mjs --gender male
 *   node scripts/generate-hair-type-examples.mjs --sync     # free, no key
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { fetchImageBytes, firstImage, runModel, withRetry } from './lib/fal.mjs';
import { EXAMPLE_GENDERS, writeExampleModule } from './lib/hairTypeExamples.mjs';
import { hairTypeSheetPrompt } from './lib/hairTypePrompts.mjs';
import {
  HAIR_TYPE_CELLS,
  formatCoverage,
  formatDistance,
  inspectTypeSheet,
  sliceTypeSheet,
} from './lib/hairTypeSheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** List price at the time of writing — confirm against fal.ai/pricing. */
const APPROX_COST_PER_IMAGE = 0.04;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    out: path.join(ROOT, 'assets', 'hair-types'),
    genders: EXAMPLE_GENDERS,
    types: HAIR_TYPE_CELLS,
    model: process.env.FAL_MODEL ?? 'fal-ai/nano-banana',
    seed: null,
    inset: 0,
    retries: 2,
    sync: false,
    slice: false,
    dryRun: false,
    force: false,
    quiet: false,
    yes: false,
  };

  const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      return value;
    };

    switch (arg) {
      case '--out': options.out = path.resolve(ROOT, next()); break;
      case '--gender': case '--genders': {
        const value = next();
        options.genders = value === 'both' ? EXAMPLE_GENDERS : list(value);
        break;
      }
      case '--type': case '--types': options.types = list(next()); break;
      case '--model': options.model = next(); break;
      case '--seed': options.seed = Number(next()); break;
      case '--inset': options.inset = Number(next()); break;
      case '--retries': options.retries = Number(next()); break;
      case '--sync': options.sync = true; break;
      case '--slice': options.slice = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--force': options.force = true; break;
      case '--yes': case '-y': options.yes = true; break;
      case '--quiet': options.quiet = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`unknown argument: ${arg}`);
    }
  }

  const badGender = options.genders.find((gender) => !EXAMPLE_GENDERS.includes(gender));
  if (badGender) fail(`unknown gender "${badGender}" — expected male, female or both`);
  const badType = options.types.find((type) => !HAIR_TYPE_CELLS.includes(type));
  if (badType) fail(`unknown hair type "${badType}" — expected ${HAIR_TYPE_CELLS.join(', ')}`);
  if (!Number.isFinite(options.inset) || options.inset < 0) fail('--inset must be zero or more pixels');
  if (!Number.isFinite(options.retries) || options.retries < 0) fail('--retries must be zero or more');

  return options;
}

function usage() {
  console.log(
    [
      "Generate the hair-type picker's example imagery with fal.ai.",
      '',
      '  node scripts/generate-hair-type-examples.mjs [options]',
      '',
      '  --gender <g>     male, female or both      (default: both)',
      '  --type <t>       which panels to cut out   (default: all four)',
      '  --sync           rebuild the app map from disk and stop — free, no key',
      '  --slice          re-cut the sheets already on disk and stop — free, no key',
      '  --inset <n>      trim n pixels off every panel edge when cutting',
      '  --retries <n>    re-rolls allowed when a panel comes back bald (default: 2)',
      '  --seed <n>       fal seed, for reproducible re-runs',
      '  --model <id>     text-to-image model       (default: fal-ai/nano-banana)',
      '  --out <dir>      output directory          (default: assets/hair-types)',
      '  --dry-run        print the plan and the prompt, call nothing',
      '  --force          regenerate a sheet that already exists',
      '  -y, --yes        skip the confirmation prompt',
      '',
      'FAL_KEY is read from the environment or from .env.local at the repo root.',
    ].join('\n'),
  );
}

function fail(message) {
  console.error(`error: ${message}\n`);
  usage();
  process.exit(1);
}

async function readKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;

  const envFile = path.join(ROOT, '.env.local');
  if (existsSync(envFile)) {
    const text = await readFile(envFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?FAL_KEY\s*=\s*(.*)$/.exec(line);
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const relative = (options, file) => path.relative(options.out, file).split(path.sep).join('/');

const sheetFile = (options, gender) => path.join(options.out, `${gender}-sheet.png`);
const exampleFile = (options, gender, type) => path.join(options.out, `${gender}-${type}.png`);

const manifestPath = (options) => path.join(options.out, 'manifest.json');

async function readManifest(options) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath(options), 'utf8'));
    manifest.genders ??= {};
    return manifest;
  } catch {
    return { generatedAt: null, model: null, genders: {} };
  }
}

async function writeManifest(options, manifest) {
  manifest.generatedAt = new Date().toISOString();
  manifest.model = options.model;
  await mkdir(options.out, { recursive: true });
  await writeFile(manifestPath(options), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function saveBytes(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

/** Cuts one sheet into its four panels and records the crops. */
async function slicePanels(options, gender) {
  const file = sheetFile(options, gender);
  const panels = sliceTypeSheet(await readFile(file), { types: options.types, inset: options.inset });
  const entries = {};

  for (const panel of panels) {
    const target = exampleFile(options, gender, panel.type);
    await saveBytes(target, panel.png);
    entries[panel.type] = { file: relative(options, target), from: relative(options, file), crop: panel.crop };
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * `attempt` offsets the seed so a re-roll is actually a different roll: with
 * --seed pinned, the same seed and a near-identical prompt would hand back the
 * same sheet, bald panel and all.
 */
function imageInput(options, prompt, attempt = 0) {
  return {
    prompt,
    num_images: 1,
    aspect_ratio: '1:1',
    output_format: 'png',
    ...(options.seed === null ? null : { seed: options.seed + attempt }),
  };
}

/**
 * One gender's sheet, measured and re-rolled if a panel came back with no hair.
 *
 * Two things can be wrong with this image, and they are not treated the same:
 *
 *   - A panel with no hair on it is a hard failure and is re-rolled by name, on
 *     the catalog's measured 3% coverage line.
 *   - Two panels drawn as the same texture is reported, recorded in the manifest
 *     and left to be looked at. The line between "close" and "the same picture"
 *     has not been measured yet (see SILHOUETTE_FLOOR), and burning re-rolls on
 *     an uncalibrated number is worse than printing it.
 */
async function generateSheet(options, key, gender) {
  const file = sheetFile(options, gender);

  if (options.dryRun) {
    console.log(`\n[dry-run] ${gender} -> ${relative(options, file)}\n\n${hairTypeSheetPrompt({ gender })}\n`);
    return null;
  }

  let best = null;
  let missing = [];

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const prompt = hairTypeSheetPrompt({ gender, missing, alike: best?.alike ?? [] });
    const image = await withRetry(`${gender} sheet`, 3, async () => {
      const result = await runModel(options.model, imageInput(options, prompt, attempt), {
        key,
        onStatus: (status) => console.log(`  · ${gender}: ${status}`),
      });
      return firstImage(result);
    });

    const bytes = await fetchImageBytes(image.url);

    // An image that cannot be measured has already been paid for: keep it,
    // treat it as unverified, and let slicing report the real decode problem.
    let report = { coverage: {}, bald: [], distance: {}, alike: [] };
    try {
      report = inspectTypeSheet(bytes, { types: options.types });
    } catch (error) {
      console.warn(`  ! ${gender}: could not measure the sheet (${error.message})`);
    }

    // Keep the best sheet seen, not the last one: a re-roll can come back worse.
    if (!best || report.bald.length < best.bald.length) best = { prompt, url: image.url, bytes, ...report };
    if (!report.bald.length) break;

    missing = report.bald;
    const left = attempt < options.retries ? ' — re-rolling' : ' — out of retries';
    console.warn(
      `  ! ${gender}: ${report.bald.join(', ')} came back with no hair ` +
        `(${formatCoverage(report.coverage, options.types)})${left}`,
    );
  }

  await saveBytes(file, best.bytes);
  return best;
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    console.error('Not a TTY — re-run with --yes to confirm.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/**
 * Points the app at whatever is now on disk. Metro fast-refreshes on the
 * rewritten module, so a sheet generated while `npm start` is running shows up
 * in the picker by itself.
 */
async function syncExamples(options) {
  if (options.dryRun) return;
  const result = await writeExampleModule({ root: ROOT, out: options.out });
  if (options.quiet) return;
  console.log(
    `App examples: ${result.relativeFile} — ${result.images} example(s) across ` +
      `${result.genders} gender(s)${result.changed ? ' (updated)' : ' (unchanged)'}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.sync) {
    await syncExamples(options);
    return;
  }

  const manifest = await readManifest(options);

  if (options.slice) {
    for (const gender of options.genders) {
      if (!existsSync(sheetFile(options, gender))) {
        console.warn(`  ! no sheet on disk for ${gender} — nothing to cut`);
        continue;
      }
      const entries = await slicePanels(options, gender);
      manifest.genders[gender] = { ...manifest.genders[gender], ...entries };
      console.log(`  ✓ ${gender} -> ${Object.keys(entries).length} panel(s) re-cut`);
    }
    await writeManifest(options, manifest);
    await syncExamples(options);
    return;
  }

  const key = await readKey();
  if (!key && !options.dryRun) {
    console.error(
      'FAL_KEY is not set. Put it in .env.local at the repo root:\n\n  FAL_KEY=your-key-here\n\n' +
        '(.env*.local is already gitignored.) Use --dry-run to preview the prompt without a key.',
    );
    process.exit(1);
  }

  const todo = options.genders.filter((gender) => options.force || !existsSync(sheetFile(options, gender)));
  const skipped = options.genders.length - todo.length;

  console.log(
    `Plan: ${todo.length} sheet(s)${skipped ? ` — ${skipped} already generated, --force to redo` : ''}\n` +
      `Each sheet is cut into ${options.types.length} example(s) locally — ` +
      `${todo.length * options.types.length} image(s) for ${todo.length} generation(s)\n` +
      `Cost: roughly $${(todo.length * APPROX_COST_PER_IMAGE).toFixed(2)} at $${APPROX_COST_PER_IMAGE}/generation ` +
      '(approximate — check fal.ai/pricing)',
  );

  if (!todo.length) {
    console.log('Nothing to do.');
    await syncExamples(options);
    return;
  }

  if (!options.dryRun && !options.yes && todo.length > 1 && !(await confirm('Generate?'))) {
    console.log('Cancelled.');
    return;
  }

  const failures = [];
  const suspect = [];

  for (const gender of todo) {
    try {
      const result = await generateSheet(options, key, gender);
      if (!result) continue;

      const entries = await slicePanels(options, gender);
      manifest.genders[gender] = {
        sheet: {
          file: relative(options, sheetFile(options, gender)),
          url: result.url,
          prompt: result.prompt,
          coverage: result.coverage,
          bald: result.bald,
          distance: result.distance,
          alike: result.alike,
        },
        ...entries,
      };
      await writeManifest(options, manifest);
      await writeExampleModule({ root: ROOT, out: options.out });

      console.log(
        `  ✓ ${gender} -> ${relative(options, sheetFile(options, gender))} (+${Object.keys(entries).length} examples)\n` +
          `      hair: ${formatCoverage(result.coverage, options.types)}\n` +
          `      apart: ${formatDistance(result.distance)}`,
      );

      if (result.bald.length) suspect.push({ gender, why: `${result.bald.join(', ')} still bald` });
      if (result.alike.length) {
        const pairs = result.alike.map(([a, b]) => `${a}/${b}`).join(', ');
        console.warn(`  ! ${gender}: ${pairs} look like the same texture — worth a look before shipping`);
        suspect.push({ gender, why: `${pairs} nearly identical` });
      }
    } catch (error) {
      failures.push({ gender, message: error.message });
      console.error(`  ✗ ${gender}: ${error.message.slice(0, 300)}`);
    }
  }

  if (options.dryRun) return;

  console.log(`\nManifest: ${manifestPath(options)}`);
  await syncExamples(options);

  if (suspect.length) {
    console.error('\nWorth looking at before these ship:');
    for (const entry of suspect) console.error(`  ${entry.gender}: ${entry.why}`);
    const genders = [...new Set(suspect.map((entry) => entry.gender))].join(',');
    console.error(`\n  node scripts/generate-hair-type-examples.mjs --force --gender ${genders}`);
    process.exitCode = 1;
  }

  if (failures.length) {
    console.error(`\n${failures.length} sheet(s) failed — re-running the same command retries only those:`);
    for (const failure of failures) console.error(`  ${failure.gender}: ${failure.message.slice(0, 200)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
