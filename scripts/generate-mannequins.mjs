#!/usr/bin/env node
/**
 * Generates the catalog's mannequin imagery with fal.ai.
 *
 * Two rules from the spec drive the whole design:
 *
 *   1. The catalog is data. This script reads `src/api/mockCatalog.ts` today and
 *      a live `GET /catalog` tomorrow (--catalog-url); it never carries its own
 *      list of hairstyles, and every prompt is derived from the record.
 *   2. Consistency matters as much as any single image. So a bald base head is
 *      generated ONCE per gender and angle, and every hairstyle is produced as an
 *      *edit* of that head. The head, material, light, crop and background are
 *      carried over instead of being re-rolled for every image.
 *
 * Sheet mode (--sheet) takes that one step further. The four approved base heads
 * are tiled locally into a 2x2 sheet (--compose-base, free, no model involved),
 * and each hairstyle is a single edit of that sheet, cut back into four PNGs
 * here. One generation instead of four, and the four views agree with each other
 * because the model drew them in one pass — on camera angles it never got the
 * chance to re-pose.
 *
 * Usage (see scripts/README.md for the full approval workflow):
 *
 *   node scripts/generate-mannequins.mjs --base-only
 *   node scripts/generate-mannequins.mjs --compose-base --gender male
 *   node scripts/generate-mannequins.mjs --sheet --style low-taper-fade --gender male
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './lib/catalog.mjs';
import { ensureRenderDirs, writeRenderModule } from './lib/renders.mjs';
import {
  HAIR_TYPE_IDS,
  VARIANT_IDS,
  isUnclassified,
  matrixOf,
  typesForVariant,
  unsupportedTypes,
  variantsOf,
} from './lib/variants.mjs';
import { ANCHOR_LENGTH, hasLengths, lengthDir, lengthPairs, lengthsOf, validateLengths } from './lib/lengths.mjs';
import { fetchImageBytes, firstImage, runModel, withRetry } from './lib/fal.mjs';
import {
  baseHalfFromFrontPrompt,
  baseHeadFromReferencePrompt,
  baseHeadPrompt,
  standaloneStylePrompt,
  stylePrompt,
  styleLengthSheetPrompt,
  styleSheetPrompt,
} from './lib/prompts.mjs';
import {
  SHEET,
  composeGrid,
  composeSheet,
  formatContrast,
  formatCoverage,
  gridAspect,
  inspectLengthSheet,
  inspectSheet,
  lengthBaseCells,
  lengthContrast,
  lengthSheet,
  parseLengthCell,
  sliceLengthSheet,
  sliceSheet,
} from './lib/sheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The approved look, cropped out of `App-reference.png`. Base heads are produced
 * by editing this image, so the material, lighting and crop are inherited rather
 * than re-described; `--reference` swaps it and deleting it falls back to a
 * text-only prompt.
 */
const DEFAULT_REFERENCE = path.join(ROOT, 'scripts', 'reference-head.png');
/**
 * The four views every haircut is shot from. `half` is the hero — the
 * three-quarter turn the catalog cards use — and the order here is the order the
 * sheet is tiled in (see SHEET in lib/sheet.mjs).
 */
const ANGLES = SHEET.cells;
const GENDERS = ['male', 'female'];

/**
 * List price at the time of writing — confirm against fal.ai/pricing. This is
 * the edit model's price, since every image in a catalog batch is an edit.
 */
const APPROX_COST_PER_IMAGE = 0.08;

/**
 * What a higher resolution tier multiplies the bill by.
 *
 * nano-banana prices 2K at 1.5x its base rate. That is the number that makes the
 * length sheet worth doing: one 12-panel 2K sheet is $0.12 against $0.24 for
 * three 4-panel 1K sheets of the same twelve views, and the panels come out the
 * same 512x512 either way. Half the money for a set of images that is also
 * internally consistent, which separate sheets could never be.
 */
const RESOLUTION_MULTIPLIER = { '1K': 1, '2K': 1.5, '4K': 3 };

/** What one generation costs at the tier this run is asking for. */
const costPerImage = (options) =>
  APPROX_COST_PER_IMAGE * (RESOLUTION_MULTIPLIER[options.resolution] ?? 1);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    out: path.join(ROOT, 'assets', 'mannequins'),
    styles: null,
    genders: GENDERS,
    angles: ANGLES,
    /**
     * Which variants of the hairstyle × hair type matrix to generate. `null` is
     * "whatever each style's `variants` row asks for" — the normal case, and
     * the one that makes hairstyle count × hair type smaller than four times
     * the catalog. Naming types narrows a run to a batch: `--hair-type coily`
     * generates only the renders type 4 users would be shown.
     */
    variants: null,
    /**
     * Shoot the length dimension: one sheet per style x variant x gender holding
     * every length that style is offered at, cut into one render per length x
     * angle. Narrows the run to the styles that carry a `lengths` row, since
     * most of the catalog has no useful length range and a fade's variable is
     * its fade height.
     */
    lengths: false,
    /**
     * The resolution tier to ask the edit model for, or null for its own default
     * (1K, which is what every render on disk was shot at).
     *
     * A length sheet defaults this to 2K and needs to: twelve panels in a 1K
     * frame are ~341x256 against today's 512x512, and CLAUDE.md already records
     * what that costs — at 1K a fade's stubble field and the separation at a
     * hairline land under a pixel and come back as a smooth mass. At 2K a 4x3
     * frame is 2048x1536 and a panel is exactly the 512x512 the catalog already
     * holds.
     */
    resolution: null,
    /** Print the per-style commands for the length batch and generate nothing. */
    plan: false,
    model: process.env.FAL_MODEL ?? 'fal-ai/nano-banana',
    /**
     * The catalog was shot on `fal-ai/nano-banana/edit` up to the men x curly
     * batch; everything from men x wavy on is nano-banana-2. It is the same
     * family, and every style is an edit of the composed base sheet rather than
     * a fresh roll, so the head, material, light, crop and framing are inherited
     * from an image either way and only the hair rendering differs between the
     * two. What the extra $0.04 buys is prompt adherence — the bald quadrant
     * `--check` reports is the failure it fixes.
     *
     * `--model` is deliberately left on nano-banana: it is text-to-image, so it
     * only runs for `--no-edit` and for a base head generated with no reference
     * on disk, neither of which is part of a catalog batch.
     */
    editModel: process.env.FAL_EDIT_MODEL ?? 'fal-ai/nano-banana-2/edit',
    catalogUrl: process.env.CATALOG_URL ?? null,
    reference: null,
    referenceUri: null,
    hasReference: false,
    concurrency: 3,
    limit: null,
    seed: null,
    baseOnly: false,
    composeBase: false,
    sheet: false,
    inset: 0,
    check: false,
    matrix: false,
    noEdit: false,
    dryRun: false,
    force: false,
    forceBase: false,
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
      case '--style': case '--styles': options.styles = list(next()); break;
      case '--gender': case '--genders': {
        const value = next();
        options.genders = value === 'both' ? GENDERS : list(value);
        break;
      }
      case '--angle': case '--angles': options.angles = list(next()); break;
      case '--hair-type': case '--hair-types': case '--type': case '--types': {
        const value = next();
        options.variants = value === 'all' ? VARIANT_IDS : list(value);
        break;
      }
      case '--matrix': options.matrix = true; break;
      case '--model': options.model = next(); break;
      case '--edit-model': options.editModel = next(); break;
      case '--catalog-url': options.catalogUrl = next(); break;
      case '--reference': options.reference = path.resolve(ROOT, next()); break;
      case '--concurrency': options.concurrency = Number(next()); break;
      case '--limit': options.limit = Number(next()); break;
      case '--seed': options.seed = Number(next()); break;
      case '--base-only': options.baseOnly = true; break;
      case '--compose-base': options.composeBase = true; break;
      case '--sheet': options.sheet = true; break;
      case '--lengths': options.lengths = true; options.sheet = true; break;
      case '--resolution': options.resolution = next(); break;
      case '--plan': options.plan = true; break;
      case '--sheet-inset': options.inset = Number(next()); break;
      case '--check': options.check = true; break;
      case '--no-edit': options.noEdit = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--force': options.force = true; break;
      case '--force-base': options.forceBase = true; break;
      case '--yes': case '-y': options.yes = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`unknown argument: ${arg}`);
    }
  }

  const badAngle = options.angles.find((angle) => !ANGLES.includes(angle));
  if (badAngle) fail(`unknown angle "${badAngle}" — expected ${ANGLES.join(', ')}`);
  const badGender = options.genders.find((gender) => !GENDERS.includes(gender));
  if (badGender) fail(`unknown gender "${badGender}" — expected male, female or both`);
  const badVariant = options.variants?.find((variant) => !VARIANT_IDS.includes(variant));
  if (badVariant) fail(`unknown hair type "${badVariant}" — expected ${VARIANT_IDS.join(', ')} or all`);
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) fail('--concurrency must be a positive number');
  if (!Number.isFinite(options.inset) || options.inset < 0) fail('--sheet-inset must be zero or more pixels');
  if (options.sheet && options.noEdit) fail('--sheet edits the composed base sheet, so it cannot be combined with --no-edit');
  // A length sheet is a sheet by construction, so --lengths implies --sheet and
  // the two can never disagree; this only catches an explicit --no-edit.
  if (options.lengths && options.noEdit) fail('--lengths is a sheet edit, so it cannot be combined with --no-edit');
  if (options.resolution && !RESOLUTION_MULTIPLIER[options.resolution]) {
    fail(`--resolution must be one of ${Object.keys(RESOLUTION_MULTIPLIER).join(', ')}`);
  }
  // The tier the length sheet needs, unless the caller has deliberately asked
  // for another one. Set here rather than in the defaults so `--resolution 1K
  // --lengths` still means 1K — useful for measuring the thing this defends
  // against, and useless for anything else.
  if (options.lengths && !options.resolution) options.resolution = '2K';

  return options;
}

function usage() {
  console.log(
    [
      "Generate the catalog's neutral mannequin imagery with fal.ai.",
      '',
      '  node scripts/generate-mannequins.mjs [options]',
      '',
      '  --style <ids>        comma-separated hairstyle ids (default: every style)',
      '  --gender <g>         male | female | both            (default: both)',
      '  --angle <a>          front,half,side,back            (default: all four)',
      '  --hair-type <t>      straight,wavy,curly,coily,any | all',
      '                       (default: every variant the catalog matrix asks for)',
      '  --matrix             print the hairstyle x hair type matrix and stop — free, no key',
      '  --limit <n>          stop after the n most popular styles — cheap sampling',
      '  --base-only          generate just the bald base heads and stop',
      '  --compose-base       tile the approved base heads into a 2x2 sheet — free, calls nothing',
      '  --sheet              one generation per style: edit the base sheet, then cut it into four views',
      '  --lengths            shoot the length dimension: one sheet per style holding every length it offers',
      '  --resolution <tier>  1K, 2K or 4K (default: the model\'s own, or 2K with --lengths)',
      '  --plan               print the per-style length commands and generate nothing',
      '  --sheet-inset <n>    trim n pixels off every panel edge when cutting a sheet',
      '  --check              inspect the sheets already on disk for bald panels and stop',
      '  --no-edit            one-shot text-to-image per style instead of editing a base',
      '  --reference <file>   look reference to seed the base heads (default: scripts/reference-head.png)',
      '  --seed <n>           fal seed, for reproducible re-runs',
      '  --model <id>         text-to-image model  (default: fal-ai/nano-banana)',
      '  --edit-model <id>    image-edit model     (default: fal-ai/nano-banana-2/edit)',
      '  --catalog-url <url>  read the catalog from the API instead of mockCatalog.ts',
      '  --out <dir>          output directory     (default: assets/mannequins)',
      '  --concurrency <n>    parallel requests    (default: 3)',
      '  --force              regenerate style images that already exist',
      '  --force-base         also regenerate the base heads (they are kept by default)',
      '  --dry-run            print the plan and the prompts, call nothing',
      '  -y, --yes            skip the confirmation prompt',
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

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

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
// Manifest — the handover to the backend
// ---------------------------------------------------------------------------

const manifestPath = (options) => path.join(options.out, 'manifest.json');

async function readManifest(options) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath(options), 'utf8'));
    manifest.base ??= {};
    manifest.styles ??= {};
    return manifest;
  } catch {
    return { generatedAt: null, models: {}, base: {}, styles: {} };
  }
}

async function writeManifest(options, manifest) {
  manifest.generatedAt = new Date().toISOString();
  manifest.models = { base: options.model, edit: options.editModel };
  await writeFile(manifestPath(options), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const relative = (options, file) => path.relative(options.out, file).split(path.sep).join('/');

const baseFile = (options, gender, angle) => path.join(options.out, '_base', `${gender}-${angle}.png`);
const baseSheetFile = (options, gender) => path.join(options.out, '_base', `${gender}-sheet.png`);
/**
 * `<style>/<variant>/<gender>-<angle>.png`.
 *
 * The variant directory is the hairstyle × hair type matrix on disk. A style
 * the matrix says needs one render has a single `any/`; a style whose curly and
 * coily versions differ has `curly/` and `coily/` and nothing else. The app
 * reads the same layout back (scripts/lib/renders.mjs).
 */
const styleFile = (options, styleId, variant, gender, angle) =>
  path.join(options.out, styleId, variant, `${gender}-${angle}.png`);
const styleSheetFile = (options, styleId, variant, gender) =>
  path.join(options.out, styleId, variant, `${gender}-sheet.png`);

/**
 * `<style>/<variant>/<length>/<gender>-<angle>.png` — except for the anchor,
 * which keeps the path it already has.
 *
 * `medium` is the length every render on disk already depicts: the catalog was
 * shot from a prompt that says nothing about length, so what is there is the cut
 * as authored, and that is what the anchor names. Giving it a directory would
 * mean moving 356 renders and 356 masks for no gain, and would leave a style
 * with no length row — most of the catalog — sitting in a `medium/` folder that
 * means nothing. So the anchor stays loose in the variant directory and only
 * `short` and `long` are nested. `lengthDir()` is the one place that decides it.
 */
const lengthStyleFile = (options, styleId, variant, gender, length, angle) => {
  const dir = lengthDir(length);
  return dir
    ? path.join(options.out, styleId, variant, dir, `${gender}-${angle}.png`)
    : styleFile(options, styleId, variant, gender, angle);
};

/** The generated length sheet, kept beside the four-view sheet it replaces. */
const lengthSheetFile = (options, styleId, variant, gender) =>
  path.join(options.out, styleId, variant, `${gender}-lengths.png`);

/**
 * Which variants of one style this run should produce.
 *
 * With no `--hair-type` that is every variant the style's matrix row asks for.
 * With one, the flag is read as a *hair type* rather than as a directory name:
 * `--hair-type coily` means "everything a type 4 user would be shown", so a cut
 * whose coily version is the same render as its curly one resolves to `curly`
 * and is skipped as already generated, instead of being shot a second time
 * under a different name. That is the whole economy of the matrix, and it would
 * be lost if the flag matched directories.
 */
function variantsForRun(style, options) {
  const all = variantsOf(style);
  if (!options.variants) return all;

  const matrix = matrixOf(style);
  const wanted = new Set();
  for (const entry of options.variants) {
    if (entry === 'any') wanted.add('any');
    else if (matrix[entry]) wanted.add(matrix[entry]);
  }
  return all.filter((variant) => wanted.has(variant));
}

/**
 * Tiles the approved base heads into one sheet. No model, no cost: the four
 * camera angles in the sheet are literally the four images already reviewed, so
 * nothing can re-pose them.
 */
async function composeBaseSheet(options, manifest, gender) {
  const available = {};
  for (const angle of ANGLES) {
    const file = baseFile(options, gender, angle);
    if (existsSync(file)) available[angle] = await readFile(file);
  }

  const found = Object.keys(available);
  if (!found.length) {
    throw new Error(`no base heads for ${gender} — run --base-only first`);
  }

  const { png, cell, missing } = composeSheet(available);
  const file = baseSheetFile(options, gender);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png);

  manifest.base[gender] ??= {};
  manifest.base[gender].sheet = {
    file: relative(options, file),
    composedFrom: found.map((angle) => relative(options, baseFile(options, gender, angle))),
    panel: cell,
  };

  console.log(
    `  ✓ ${gender} sheet -> ${relative(options, file)} (${cell}px panels from ${found.join(', ')})` +
      `${missing.length ? ` — ${missing.join(', ')} left blank` : ''}`,
  );
  return missing;
}

/**
 * Cuts a generated sheet into the four angle PNGs, under exactly the names the
 * per-angle path would have produced. Each entry records the sheet it came from
 * and the crop used, so a panel can be re-cut without regenerating.
 */
async function slicePanels(options, sheetFile, fileFor) {
  const panels = sliceSheet(await readFile(sheetFile), { angles: options.angles, inset: options.inset });
  const entries = {};

  for (const panel of panels) {
    const file = fileFor(panel.angle);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, panel.png);
    entries[panel.angle] = {
      file: relative(options, file),
      from: relative(options, sheetFile),
      crop: panel.crop,
    };
  }
  return entries;
}

async function saveBytes(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

async function saveImage(file, url) {
  await saveBytes(file, await fetchImageBytes(url));
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** fal takes an inline image wherever it takes an image url. */
async function dataUri(file) {
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function imageInput(options, prompt, extra = null) {
  return {
    prompt,
    num_images: 1,
    aspect_ratio: '1:1',
    output_format: 'png',
    // Only sent when a tier was asked for, so a normal catalog batch is byte
    // for byte the request it has always been. A length sheet sets it to 2K.
    ...(options.resolution ? { resolution: options.resolution } : null),
    ...(options.seed === null ? null : { seed: options.seed }),
    ...extra,
  };
}

/** Which base heads still have to be generated for this run. */
function missingBases(options, manifest, needed) {
  return needed.filter(({ gender, angle }) => {
    const entry = manifest.base?.[gender]?.[angle];
    return options.forceBase || !entry || !existsSync(baseFile(options, gender, angle));
  });
}

/**
 * The base head is the reference every style edit is built on, so it is
 * generated serially and only once: approve these before spending money on the
 * catalog, because every later image inherits their proportions and lighting.
 */
async function ensureBaseHeads(options, manifest, needed, key) {
  const missing = missingBases(options, manifest, needed);
  if (!missing.length) return;

  console.log(`
Base heads: generating ${missing.length} of ${needed.length}`);

  // `half` is made by turning the approved front head, so front has to exist
  // first. ANGLES already orders them that way; sorting makes it not depend on
  // that, since a run can ask for any subset in any order.
  const order = [...missing].sort((x, y) => Number(x.angle === 'half') - Number(y.angle === 'half'));

  for (const { gender, angle } of order) {
    const file = baseFile(options, gender, angle);
    const front = baseFile(options, gender, 'front');

    /**
     * Three ways to make a base head, in order of how much they carry over
     * rather than describe:
     *
     *   half  — an edit of this gender's approved front head, turned. The angle
     *           is a small delta from an image already accepted, which is the
     *           only thing that reliably lands it (see baseHalfFromFrontPrompt).
     *   other — an edit of the look reference, which carries the material,
     *           lighting, crop and background over from the mockup.
     *   none  — described from scratch, when there is no reference at all.
     */
    const fromFront = angle === 'half' && existsSync(front);
    const fromReference = !fromFront && options.hasReference;
    const prompt = fromFront
      ? baseHalfFromFrontPrompt(gender)
      : fromReference
        ? baseHeadFromReferencePrompt(gender, angle)
        : baseHeadPrompt(gender, angle);

    if (angle === 'half' && !fromFront) {
      console.warn(
        `  ! no ${relative(options, front)} to turn — falling back to describing the hero angle, ` +
          'which lands it badly. Generate the front head first.',
      );
    }

    if (options.dryRun) {
      console.log(`
[dry-run] base ${gender}/${angle} -> ${relative(options, file)}
  ${prompt}`);
      continue;
    }

    const seed = fromFront ? await dataUri(front) : options.referenceUri;

    const image = await withRetry(`base ${gender}/${angle}`, 3, async () => {
      const result =
        fromFront || fromReference
          ? await runModel(options.editModel, imageInput(options, prompt, { image_urls: [seed] }), { key })
          : await runModel(options.model, imageInput(options, prompt), { key });
      return firstImage(result);
    });

    await saveImage(file, image.url);
    manifest.base[gender] ??= {};
    manifest.base[gender][angle] = { file: relative(options, file), url: image.url, prompt };
    await writeManifest(options, manifest);
    console.log(`  ✓ base ${gender}/${angle} -> ${relative(options, file)}`);
  }
}

/**
 * One style x variant x gender at every length it is offered at, in a single
 * generation.
 *
 * Structurally the same path as the four-view branch below — compose a base,
 * edit it, measure every panel, report what came back wrong — against a taller
 * grid. The base is composed here rather than read
 * from `_base/`: a length base is the same four approved heads repeated once per
 * row, which is free to tile and would only be a second thing to keep in sync if
 * it were cached on disk.
 */
async function generateLengthSheet(job, options, key) {
  const { style, gender, variant, lengths, file } = job;
  const layout = lengthSheet(lengths);

  if (options.dryRun) {
    return { prompt: styleLengthSheetPrompt({ style, gender, lengths, variant, extra: job.extra }), dryRun: true };
  }

  const heads = Object.fromEntries(
    await Promise.all(
      SHEET.cells.map(async (a) => {
        const head = baseFile(options, gender, a);
        if (!existsSync(head)) {
          throw new Error(`missing base head ${relative(options, head)} — run with --base-only first`);
        }
        return [a, await readFile(head)];
      }),
    ),
  );

  const composed = composeGrid(layout, lengthBaseCells(heads, lengths));
  const baseUri = `data:image/png;base64,${composed.png.toString('base64')}`;

  const prompt = styleLengthSheetPrompt({ style, gender, lengths, variant, extra: job.extra });
  const image = await withRetry(job.label, 3, async () => {
    const result = await runModel(
      options.editModel,
      imageInput(options, prompt, { image_urls: [baseUri], aspect_ratio: gridAspect(layout) }),
      { key },
    );
    return firstImage(result);
  });

  const bytes = await fetchImageBytes(image.url);

  let coverage = {};
  let bald = [];
  // A length sheet has two ways to fail, and both are silent in the response.
  // A bald panel is a head the model skipped; a flat sheet is a range it did
  // not draw. Neither is visible without measuring, so both are still measured
  // — but measuring only reports now. The sheet that came back is the sheet
  // that is kept, and paying for a second one is a decision the caller makes
  // with --force after looking at this one.
  let contrast = { rows: [], ratios: [], flat: [] };
  try {
    ({ coverage, bald } = inspectLengthSheet(bytes, lengths, { angles: options.angles }));
    contrast = lengthContrast(coverage, lengths, { angles: options.angles });
  } catch (error) {
    console.warn(`  ! ${job.label}: could not measure hair coverage (${error.message})`);
  }

  if (bald.length) console.warn(`  ! ${job.label}: ${bald.join(', ')} came back bald`);
  if (contrast.flat.length) {
    console.warn(
      `  ! ${job.label}: ${contrast.flat.join(', ')} barely differs from the row above ` +
        `(${formatContrast(lengths, contrast)})`,
    );
  } else if (!bald.length) {
    console.log(`  · ${job.label}: ${formatContrast(lengths, contrast)}`);
  }

  await saveBytes(file, bytes);
  return { prompt, url: image.url, coverage, bald, contrast };
}

/**
 * Cuts a length sheet into one render per length x angle.
 *
 * The anchor row lands on top of the render that is already there, and that is
 * deliberate rather than careless: the three lengths only mean anything as a set
 * if they came out of one generation, so the medium row has to replace the
 * separately-shot medium it is meant to sit between. Re-shooting the anchor is
 * the cost of the dimension, and `--matrix` counts it.
 */
async function sliceLengthPanels(options, job) {
  const panels = sliceLengthSheet(await readFile(job.file), job.lengths, {
    angles: options.angles,
    inset: options.inset,
  });
  const entries = {};

  for (const panel of panels) {
    const file = lengthStyleFile(options, job.style.id, job.variant, job.gender, panel.length, panel.angle);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, panel.png);
    entries[`${panel.length}:${panel.angle}`] = {
      file: relative(options, file),
      from: relative(options, job.file),
      crop: panel.crop,
    };
  }
  return entries;
}

/**
 * Passes the base head to the edit model by its fal-hosted url when we have one
 * and as a data uri otherwise, so an approved head keeps working after the
 * hosted url expires.
 */
async function baseImageRef(options, manifest, gender, angle) {
  const entry = manifest.base?.[gender]?.[angle];
  if (entry?.url && !entry.url.startsWith('data:')) return entry.url;

  const file = baseFile(options, gender, angle);
  if (!existsSync(file)) {
    throw new Error(`missing base head ${relative(options, file)} — run with --base-only first`);
  }
  return dataUri(file);
}

async function generateStyleImage(job, options, manifest, key) {
  const { style, gender, angle, variant, file } = job;

  if (job.lengths) return generateLengthSheet(job, options, key);

  if (options.sheet) {
    const base = baseSheetFile(options, gender);
    if (!existsSync(base)) {
      throw new Error(`no base sheet for ${gender} — run --compose-base --gender ${gender} first`);
    }

    if (options.dryRun) return { prompt: styleSheetPrompt({ style, gender, variant, extra: job.extra }), dryRun: true };

    const baseUri = await dataUri(base);

    // A sheet is only a success if all four heads actually got the haircut. The
    // model skips one often enough (~1 panel in 8, usually `front`) that
    // accepting the response unmeasured quietly puts a bald head in the
    // catalog, so every sheet is measured and a skipped panel is named in the
    // run's closing report. Redoing it costs a second generation, so that is
    // the caller's call to make with --force rather than this script's.
    const prompt = styleSheetPrompt({ style, gender, variant, extra: job.extra });
    const image = await withRetry(job.label, 3, async () => {
      const result = await runModel(
        options.editModel,
        imageInput(options, prompt, { image_urls: [baseUri] }),
        { key },
      );
      return firstImage(result);
    });

    const bytes = await fetchImageBytes(image.url);

    // An image that cannot be measured is not an image that should be thrown
    // away — it has already been paid for. Treat it as unverified, keep it,
    // and let slicing report the real decode problem.
    let coverage = {};
    let bald = [];
    try {
      ({ coverage, bald } = inspectSheet(bytes, { angles: options.angles }));
    } catch (error) {
      console.warn(`  ! ${job.label}: could not measure hair coverage (${error.message})`);
    }
    if (bald.length) {
      console.warn(`  ! ${job.label}: ${bald.join(', ')} came back bald (${formatCoverage(coverage, options.angles)})`);
    }

    await saveBytes(file, bytes);
    return { prompt, url: image.url, coverage, bald };
  }

  if (options.noEdit) {
    const prompt = standaloneStylePrompt({ style, gender, angle, variant, extra: job.extra });
    if (options.dryRun) return { prompt, dryRun: true };

    const image = await withRetry(job.label, 3, async () => {
      const result = await runModel(options.model, imageInput(options, prompt), { key });
      return firstImage(result);
    });
    await saveImage(file, image.url);
    return { prompt, url: image.url };
  }

  const prompt = stylePrompt({ style, gender, angle, variant, extra: job.extra });
  if (options.dryRun) return { prompt, dryRun: true };

  const base = await baseImageRef(options, manifest, gender, angle);

  const image = await withRetry(job.label, 3, async () => {
    const result = await runModel(options.editModel, imageInput(options, prompt, { image_urls: [base] }), { key });
    return firstImage(result);
  });

  await saveImage(file, image.url);
  return { prompt, url: image.url };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

function buildJobs(catalog, options, overrides) {
  const wanted = options.styles ? new Set(options.styles) : null;
  if (wanted) {
    for (const id of wanted) {
      if (!catalog.hairstyles.some((style) => style.id === id)) {
        fail(`no hairstyle with id "${id}" in the catalog`);
      }
    }
  }

  let styles = catalog.hairstyles
    .filter((style) => (wanted ? wanted.has(style.id) : true))
    .slice()
    .sort((a, b) => b.popularity - a.popularity);
  if (options.limit !== null) styles = styles.slice(0, options.limit);

  const jobs = [];
  for (const style of styles) {
    for (const variant of variantsForRun(style, options)) {
      for (const gender of style.genders) {
        if (!options.genders.includes(gender)) continue;

        // A length run is a different unit of work: one sheet per style x
        // variant x gender covering every length, rather than one per angle or
        // one per four angles. Styles with no length row are skipped entirely
        // rather than shot at a single length, because a run that quietly
        // widened to the whole catalog would be an expensive surprise.
        if (options.lengths) {
          if (!hasLengths(style, gender)) continue;
          const file = lengthSheetFile(options, style.id, variant, gender);
          jobs.push({
            style,
            variant,
            gender,
            angle: null,
            lengths: lengthsOf(style, gender),
            file,
            extra: overrides[style.id] ?? null,
            label: `${style.id} ${variant}/${gender} lengths`,
            exists: existsSync(file),
          });
          continue;
        }

        // One sheet covers every angle, so sheet mode plans per gender and the
        // angles come out of the crop rather than out of separate generations.
        for (const angle of options.sheet ? [null] : options.angles) {
          const file = options.sheet
            ? styleSheetFile(options, style.id, variant, gender)
            : styleFile(options, style.id, variant, gender, angle);
          jobs.push({
            style,
            variant,
            gender,
            angle,
            file,
            extra: overrides[style.id] ?? null,
            label: options.sheet
              ? `${style.id} ${variant}/${gender}`
              : `${style.id} ${variant}/${gender}/${angle}`,
            exists: existsSync(file),
          });
        }
      }
    }
  }
  return jobs;
}

/** Per-style prompt nudges, for the few styles the generic vocabulary misses. */
async function loadOverrides() {
  const file = path.join(ROOT, 'scripts', 'mannequin-overrides.json');
  if (!existsSync(file)) return {};
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Loads the look reference once. It seeds the base heads only — every style is
 * then an edit of a base head, so the look propagates without the reference's
 * own haircut bleeding into other styles.
 */
async function resolveReference(options) {
  const file = options.reference ?? (existsSync(DEFAULT_REFERENCE) ? DEFAULT_REFERENCE : null);
  if (!file) return;
  if (options.reference && !existsSync(options.reference)) fail(`--reference file not found: ${options.reference}`);

  options.hasReference = true;
  console.log(`Reference: ${path.relative(ROOT, file).split(path.sep).join('/')}`);
  if (!options.dryRun) options.referenceUri = await dataUri(file);
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

/** Runs `worker` over `items` with a fixed number of parallel slots. */
async function pool(items, size, worker) {
  const queue = items.slice();
  const width = Math.max(1, Math.min(size, queue.length));
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await worker(item);
      }
    }),
  );
}

const dedupeIds = (ids) => [...new Set(ids)];

function dedupe(pairs) {
  const seen = new Map();
  for (const pair of pairs) seen.set(`${pair.gender}/${pair.angle}`, pair);
  return [...seen.values()];
}


// ---------------------------------------------------------------------------
// The length plan
// ---------------------------------------------------------------------------

/**
 * Prints one command per style x gender that carries a length row, and
 * generates nothing.
 *
 * The list is derived from the catalog's own `lengths` rows rather than typed
 * out, for the same reason `--matrix` derives its table: the classification is
 * data, it will change, and a hand-kept list of commands would be wrong the
 * first time a row moved. Adding a style to the length dimension is a row in
 * `mockCatalog.ts` and a re-run of this.
 *
 * Ordered men first, then women, and within each by how much of the batch is
 * already on disk — so the cheapest confirmations come first and an expensive
 * re-shoot is never the thing you try the pipeline on.
 */
async function printLengthPlan(options, catalog) {
  const problems = catalog.hairstyles.flatMap((style) => validateLengths(style));
  if (problems.length) {
    console.error('\nInvalid length rows:');
    for (const problem of problems) console.error(`  ! ${problem}`);
    process.exitCode = 1;
    return;
  }

  const pairs = lengthPairs(catalog, {
    styles: options.styles,
    genders: options.genders,
  });

  if (!pairs.length) {
    console.log('\nNo hairstyle in the catalog carries a `lengths` row.');
    return;
  }

  const cost = costPerImage({ resolution: options.resolution ?? '2K' });
  let sheets = 0;
  let done = 0;

  const rows = pairs.map(({ style, gender, lengths }) => {
    const variants = variantsForRun(style, options);
    const shot = variants.filter((variant) =>
      existsSync(lengthSheetFile(options, style.id, variant, gender)),
    ).length;
    sheets += variants.length;
    done += shot;
    return { style, gender, lengths, variants, shot };
  });

  for (const gender of options.genders) {
    const mine = rows
      .filter((row) => row.gender === gender)
      .sort((a, b) => b.shot - a.shot || a.style.id.localeCompare(b.style.id));
    if (!mine.length) continue;

    console.log(`\n${'='.repeat(72)}\n${gender === 'male' ? "MEN'S" : "WOMEN'S"} HAIRSTYLES — ${mine.length} to shoot\n${'='.repeat(72)}`);

    for (const row of mine) {
      const left = row.variants.length - row.shot;
      const price = `$${(left * cost).toFixed(2)}`;
      const state = row.shot ? ` (${row.shot}/${row.variants.length} already shot)` : '';
      console.log(
        `\n# ${row.style.name} — ${row.lengths.join(' / ')} — ` +
          `${row.variants.length} sheet(s) x ${row.lengths.length * options.angles.length} panels, ${price}${state}`,
      );
      console.log(
        `node scripts/generate-mannequins.mjs --lengths --style ${row.style.id} --gender ${gender}`,
      );
    }
  }

  const left = sheets - done;
  console.log(`\n${'='.repeat(72)}`);
  console.log(
    `${pairs.length} style x gender pair(s), ${sheets} sheet(s), ${sheets * 12} panel(s) at most.\n` +
      `${done} sheet(s) already shot, ${left} to go — roughly $${(left * cost).toFixed(2)} at $${cost.toFixed(3)}/sheet.`,
  );
  console.log(
    '\nEach command shoots every hair-type variant of that style x gender, and each sheet\n' +
      'carries all of its lengths in one generation — so the lengths of one cut are always\n' +
      'consistent with each other. The anchor row is re-shot and replaces the render that is\n' +
      'already there: three lengths only mean anything as a set if they came from one image.',
  );
  console.log(
    '\nThe app updates itself as each one lands: the generator rewrites\n' +
      'src/api/mannequinRenders.generated.ts after every finished style and Metro fast-refreshes,\n' +
      'so a style generated while `npm start` is running appears without a restart.',
  );
}

// ---------------------------------------------------------------------------
// The hairstyle x hair type matrix
// ---------------------------------------------------------------------------

/**
 * Prints the matrix and what it costs, and generates nothing.
 *
 * This is the report to read before committing to a batch: it is the catalog's
 * own `variants` rows laid out as the table the plan asks for, so the answer to
 * "which images do we still need" comes out of the data rather than out of a
 * spreadsheet kept beside it. Free, needs no key.
 *
 * A cell is the variant a type resolves to; two types sharing a name share one
 * render. A dash is a style not offered for that type at all.
 */
async function printMatrix(options, catalog) {
  const styles = catalog.hairstyles
    .filter((style) => (options.styles ? options.styles.includes(style.id) : true))
    .filter((style) => style.genders.some((gender) => options.genders.includes(gender)));

  const pad = (text, width) => String(text).padEnd(width);
  const idWidth = Math.max(9, ...styles.map((style) => style.id.length));
  const cellWidth = 9;

  console.log(
    `\n${pad('hairstyle', idWidth)}  ${HAIR_TYPE_IDS.map((type) => pad(type, cellWidth)).join('')}` +
      'renders  on disk',
  );
  console.log('-'.repeat(idWidth + cellWidth * HAIR_TYPE_IDS.length + 19));

  let renders = 0;
  let generations = 0;
  let onDisk = 0;
  const unclassified = [];
  const todo = new Set();

  for (const style of styles) {
    const genders = style.genders.filter((gender) => options.genders.includes(gender));
    const variants = variantsOf(style);
    const matrix = matrixOf(style);

    // "On disk" counts generations, not files: one sheet per variant per gender
    // is what a run actually pays for.
    let have = 0;
    for (const variant of variants) {
      for (const gender of genders) {
        const done = ANGLES.every((angle) => existsSync(styleFile(options, style.id, variant, gender, angle)));
        if (done) have += 1;
        else todo.add(style.id);
      }
    }

    const want = variants.length * genders.length;
    renders += variants.length;
    generations += want;
    onDisk += have;
    if (isUnclassified(style)) unclassified.push(style.id);

    console.log(
      `${pad(style.id, idWidth)}  ` +
        HAIR_TYPE_IDS.map((type) => pad(matrix[type] ?? '-', cellWidth)).join('') +
        `${pad(variants.length, 9)}${have}/${want}`,
    );
  }

  const naive = styles.length * HAIR_TYPE_IDS.length;
  console.log(
    `\n${styles.length} style(s): ${renders} distinct render(s) instead of ${naive} ` +
      `(one per type) — ${naive - renders} generation(s) the matrix says would show the same image.`,
  );
  console.log(
    `Across ${options.genders.join(' and ')}: ${generations} generation(s), ${onDisk} already on disk, ` +
      `${generations - onDisk} to go (roughly $${((generations - onDisk) * APPROX_COST_PER_IMAGE).toFixed(2)}).`,
  );

  const missingTypes = styles
    .map((style) => ({ id: style.id, types: unsupportedTypes(style) }))
    .filter((entry) => entry.types.length);
  if (missingTypes.length) {
    console.log(`\nNot offered for every type (a dash above):`);
    for (const entry of missingTypes) console.log(`  ${pad(entry.id, idWidth)}  no ${entry.types.join(', ')}`);
  }

  if (unclassified.length) {
    console.error(
      `\n${unclassified.length} style(s) have no \`variants\` row and fell back to a single ` +
        `\`any\` render — classify them in the catalog:\n  ${unclassified.join(', ')}`,
    );
    process.exitCode = 1;
  }

  if (todo.size) {
    console.log(
      `\nNext, one hair type at a time:\n\n` +
        `  node scripts/generate-mannequins.mjs --sheet --gender ${options.genders[0]} --hair-type coily`,
    );
  }
}

// ---------------------------------------------------------------------------
// Auditing what is already on disk
// ---------------------------------------------------------------------------

/**
 * Measures every sheet already generated and reports the bald ones. Free — it
 * reads pixels, calls nothing — so it is worth running over the whole catalog
 * after a big run, and it is the way to find sheets produced before the
 * generator started checking its own output.
 */
async function checkSheets(options, manifest, catalog) {
  const wanted = options.styles ? new Set(options.styles) : null;
  const rows = [];

  for (const style of catalog.hairstyles) {
    if (wanted && !wanted.has(style.id)) continue;
    for (const variant of variantsForRun(style, options)) {
      for (const gender of style.genders) {
        if (!options.genders.includes(gender)) continue;
        // Length sheets are checked in preference to the four-view sheet they
        // replace: where both exist the length one is what the app is showing,
        // and it is the one with a second way to fail.
        const lengths = lengthsOf(style, gender);
        const lengthFile = lengthSheetFile(options, style.id, variant, gender);
        if (lengths.length > 1 && existsSync(lengthFile)) {
          const bytes = await readFile(lengthFile);
          const { coverage, bald } = inspectLengthSheet(bytes, lengths, { angles: options.angles });
          const contrast = lengthContrast(coverage, lengths, { angles: options.angles });
          rows.push({ id: style.id, variant, gender, coverage, bald, lengths, contrast });

          const entry = manifest.styles?.[style.id]?.[variant]?.[gender]?.lengths;
          if (entry) Object.assign(entry, { coverage, bald, contrast });
          continue;
        }

        const file = styleSheetFile(options, style.id, variant, gender);
        if (!existsSync(file)) continue;
        const { coverage, bald } = inspectSheet(await readFile(file), { angles: options.angles });
        rows.push({ id: style.id, variant, gender, coverage, bald });

        // Record the verdict so the contact sheet flags these too — sheets
        // generated before the check existed carry no coverage of their own.
        const entry = manifest.styles?.[style.id]?.[variant]?.[gender]?.sheet;
        if (entry) Object.assign(entry, { coverage, bald });
      }
    }
  }

  if (!rows.length) {
    console.log('\nNo sheets on disk to check.');
    return;
  }

  const name = ({ id, variant, gender }) => `${id} ${variant}/${gender}`;
  const width = Math.max(...rows.map((row) => name(row).length));
  console.log(`\nChecking ${rows.length} sheet(s):\n`);
  for (const row of rows) {
    // A length sheet is reported on its range rather than on its per-angle
    // coverage: twelve percentages is not something anyone reads, and the
    // question being asked of a length sheet is whether the slider will look
    // like it does anything.
    if (row.lengths) {
      const faults = [
        ...(row.bald.length ? [`${row.bald.join(', ')} bald`] : []),
        ...(row.contrast.flat.length ? [`${row.contrast.flat.join(', ')} too close to the row above`] : []),
      ];
      console.log(
        `  ${faults.length ? '✗' : '✓'} ${name(row).padEnd(width)}  ${formatContrast(row.lengths, row.contrast)}` +
          `${faults.length ? `   <- ${faults.join('; ')}` : ''}`,
      );
      continue;
    }
    console.log(
      `  ${row.bald.length ? '✗' : '✓'} ${name(row).padEnd(width)}  ${formatCoverage(row.coverage, options.angles)}` +
        `${row.bald.length ? `   <- ${row.bald.join(', ')} bald` : ''}`,
    );
  }

  const weak = rows.filter((row) => row.lengths && row.contrast.flat.length);
  if (weak.length) {
    console.log(
      `\n${weak.length} length sheet(s) do not show a wide enough range. ` +
        'Each of these is another generation, so decide before running them:\n' +
        [...new Set(weak.map((row) => `  node scripts/generate-mannequins.mjs --lengths --force --style ${row.id} --gender ${row.gender}`))].join('\n'),
    );
  }

  await writeManifest(options, manifest);
  console.log(`
Contact sheet: ${await writeContactSheet(options, manifest, catalog)}`);

  const bad = rows.filter((row) => row.bald.length);
  if (!bad.length) {
    // Counted per sheet rather than assumed: a length sheet carries one row
    // of views per length, so "all 4 views" is the wrong number for it.
    const views = rows.reduce(
      (total, row) => total + options.angles.length * (row.lengths?.length ?? 1),
      0,
    );
    console.log(`\nAll ${rows.length} sheet(s) have hair on all ${views} view(s).`);
    return;
  }

  const ids = dedupeIds(bad.map((row) => row.id));
  console.error(
    `\n${bad.length} of ${rows.length} sheet(s) have a bald view. Redo them (--force, since the files exist):\n\n` +
      `  node scripts/generate-mannequins.mjs --sheet --force --style ${ids.join(',')}`,
  );
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Contact sheet — how a run gets reviewed
// ---------------------------------------------------------------------------

async function writeContactSheet(options, manifest, catalog) {
  const nameFor = (id) => catalog.hairstyles.find((style) => style.id === id)?.name ?? id;

  // A sheet whose manifest entry records bald panels is flagged here too: the
  // contact sheet is where a run is actually reviewed, and a missed haircut is
  // much easier to spot when the page points at it.
  const cell = (entry, caption) => {
    if (!entry) return '';
    const bald = entry.bald?.length ? ` <b>${entry.bald.join(', ')} bald</b>` : '';
    return (
      `<figure class="${entry.bald?.length ? 'bald' : ''}"><img src="${entry.file}" alt="${caption}" loading="lazy">` +
      `<figcaption>${caption}${bald}</figcaption></figure>`
    );
  };

  const section = (title, rows) => (rows.trim() ? `<section><h2>${title}</h2><div class="row">${rows}</div></section>` : '');

  const cells = ['sheet', ...ANGLES];

  const baseRows = GENDERS.flatMap((gender) =>
    cells.map((angle) => cell(manifest.base?.[gender]?.[angle], `${gender} · ${angle}`)),
  ).join('');

  // One block per variant, because the whole point of a contact sheet is
  // judging consistency, and the coily shot of a cut has to be looked at beside
  // its straight shot rather than filed under the same heading.
  const typesFor = (id, variant) => {
    const style = catalog.hairstyles.find((entry) => entry.id === id);
    const types = style ? typesForVariant(style, variant) : [];
    return types.length ? ` — ${types.join(', ')}` : '';
  };

  const styleSections = Object.keys(manifest.styles)
    .sort()
    .flatMap((id) =>
      VARIANT_IDS.filter((variant) => manifest.styles[id]?.[variant]).map((variant) => {
        const rows = GENDERS.flatMap((gender) =>
          cells.map((angle) =>
            cell(manifest.styles[id]?.[variant]?.[gender]?.[angle], `${gender} · ${angle}`),
          ),
        ).join('');
        return section(
          `${nameFor(id)} <code>${id}</code> <b>${variant}</b><small>${typesFor(id, variant)}</small>`,
          rows,
        );
      }),
    )
    .join('\n');

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Louvo mannequins</title>
<style>
  body { font: 14px -apple-system, system-ui, sans-serif; background: #F6F3EE; color: #241C16; margin: 32px; }
  h1 { font-size: 20px; }
  h2 { font-size: 15px; font-weight: 600; margin: 28px 0 8px; }
  code { font-size: 12px; color: #8A7C6E; }
  h2 b { font-size: 12px; color: #C4462F; }
  h2 small { font-size: 12px; font-weight: 400; color: #8A7C6E; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; }
  figure { margin: 0; width: 160px; }
  img { width: 160px; height: 160px; object-fit: cover; border-radius: 12px; background: #EFE9E1; display: block; }
  figcaption { font-size: 11px; color: #6F6259; margin-top: 4px; }
  .bald img { outline: 2px solid #C4462F; outline-offset: 2px; }
  .bald b { color: #C4462F; font-weight: 600; }
</style>
<h1>Louvo mannequin catalog</h1>
<p>Generated ${manifest.generatedAt ?? ''} · ${manifest.models?.edit ?? ''}</p>
${section('Base heads', baseRows)}
${styleSections}
`;

  const file = path.join(options.out, 'index.html');
  await writeFile(file, html, 'utf8');
  return file;
}

/**
 * Points the app at whatever is now on disk.
 *
 * Metro only bundles an asset that some module requires by a literal path, so
 * the render map (`src/api/mannequinRenders.generated.ts`) is rewritten from the
 * output directory after every run. It is rebuilt from the whole directory, so
 * styles generated on earlier runs stay; a style whose images just landed starts
 * showing them in the app with no further step — Metro fast-refreshes on the
 * rewritten module.
 */
async function syncRenders(options) {
  if (options.dryRun) return;
  const result = await writeRenderModule({ root: ROOT, out: options.out });
  console.log(
    `App renders: ${result.relativeFile} — ${result.images} view(s) across ${result.variants} variant(s) ` +
      `of ${result.styles} style(s)${result.changed ? ' (updated)' : ' (unchanged)'}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = await readKey();

  if (!key && !options.dryRun && !options.check && !options.matrix && !options.plan) {
    console.error(
      'FAL_KEY is not set. Put it in .env.local at the repo root:\n\n  FAL_KEY=your-key-here\n\n' +
        '(.env*.local is already gitignored.) Use --dry-run to preview prompts without a key.',
    );
    process.exit(1);
  }

  const catalog = await loadCatalog({ root: ROOT, catalogUrl: options.catalogUrl });
  const overrides = await loadOverrides();
  await resolveReference(options);
  const manifest = await readManifest(options);
  await mkdir(options.out, { recursive: true });

  console.log(`Catalog: ${catalog.hairstyles.length} styles from ${options.catalogUrl ?? 'src/api/mockCatalog.ts'}`);

  if (options.plan) {
    await printLengthPlan(options, catalog);
    return;
  }

  if (options.matrix) {
    await printMatrix(options, catalog);
    return;
  }

  if (options.check) {
    await checkSheets(options, manifest, catalog);
    await syncRenders(options);
    return;
  }

  const jobs = buildJobs(catalog, options, overrides);
  const todo = options.force ? jobs : jobs.filter((job) => !job.exists);

  if (options.composeBase) {
    console.log(`\nComposing base sheets from the approved heads`);
    for (const gender of options.genders) {
      await composeBaseSheet(options, manifest, gender);
    }
    await writeManifest(options, manifest);
    console.log(`\nContact sheet: ${await writeContactSheet(options, manifest, catalog)}`);
    await syncRenders(options);
    return;
  }

  if (options.baseOnly) {
    const needed = dedupe(options.genders.flatMap((gender) => options.angles.map((angle) => ({ gender, angle }))));
    await ensureBaseHeads(options, manifest, needed, key);
    if (!options.dryRun) {
      await writeManifest(options, manifest);
      console.log(`\nContact sheet: ${await writeContactSheet(options, manifest, catalog)}`);
    }
    return;
  }

  const baseNeeded = options.noEdit || options.sheet ? [] : dedupe(todo.map(({ gender, angle }) => ({ gender, angle })));
  const baseMissing = missingBases(options, manifest, baseNeeded).length;
  const total = todo.length + baseMissing;
  const skipped = jobs.length - todo.length;

  console.log(
    `Plan: ${todo.length} ${options.sheet ? 'style sheet(s)' : 'style image(s)'}` +
      `${skipped ? ` — ${skipped} already generated, --force to redo` : ''}` +
      `${options.lengths ? `\nEach sheet is cut into ${options.angles.length} view(s) per length locally` : options.sheet ? `\nEach sheet is cut into ${options.angles.length} view(s) locally — ${todo.length * options.angles.length} image(s) for ${todo.length} generation(s)` : ''}` +
      `${baseMissing ? `, plus ${baseMissing} base head(s)` : ''}` +
      `\nCost: ~${total} generation(s), roughly $${(total * costPerImage(options)).toFixed(2)} at ` +
      `$${costPerImage(options).toFixed(3)}/image${options.resolution ? ` (${options.resolution})` : ''} ` +
      '(approximate — check fal.ai/pricing)',
  );

  if (!todo.length) {
    console.log('Nothing to do.');
    await syncRenders(options);
    return;
  }

  if (!options.dryRun && !options.yes && total > 4 && !(await confirm('Generate?'))) {
    console.log('Cancelled.');
    return;
  }

  // Before anything is generated, not as each style lands: Metro's watcher on
  // Windows and Linux loses files written into a directory it has not finished
  // registering, and a `--lengths` run creates `short/` and `long/` and fills
  // them within milliseconds. Creating them up here means the first panel is
  // written a whole generation later than its directory — see
  // `ensureRenderDirs`. `npm start` does the same thing for the catalog as it
  // stands; this covers a style the catalog gained since the server booted.
  if (!options.dryRun) {
    const created = await ensureRenderDirs({ out: options.out, catalog });
    if (created.length) console.log(`Created ${created.length} render directory(s) ahead of the run`);
  }

  await ensureBaseHeads(options, manifest, baseNeeded, key);

  let done = 0;
  const failures = [];
  const incomplete = [];

  await pool(todo, options.concurrency, async (job) => {
    try {
      const result = await generateStyleImage(job, options, manifest, key);
      done += 1;

      if (result.dryRun) {
        console.log(`\n[dry-run] ${job.label} -> ${relative(options, job.file)}\n  ${result.prompt}`);
        return;
      }

      manifest.styles[job.style.id] ??= {};
      const byVariant = (manifest.styles[job.style.id][job.variant] ??= {});
      const byAngle = (byVariant[job.gender] ??= {});
      const entry = { file: relative(options, job.file), url: result.url, prompt: result.prompt };

      if (job.lengths) {
        byAngle.lengths = {
          ...entry,
          coverage: result.coverage,
          bald: result.bald,
          // Kept so a sheet that came back flat can be found later without
          // re-measuring every image in the catalog.
          contrast: result.contrast,
        };
        if (result.bald.length) incomplete.push({ job, bald: result.bald });
        Object.assign(byAngle, await sliceLengthPanels(options, job));
      } else if (options.sheet) {
        byAngle.sheet = { ...entry, coverage: result.coverage, bald: result.bald };
        if (result.bald.length) incomplete.push({ job, bald: result.bald });
        Object.assign(
          byAngle,
          await slicePanels(options, job.file, (angle) =>
            styleFile(options, job.style.id, job.variant, job.gender, angle),
          ),
        );
      } else {
        byAngle[job.angle] = entry;
      }

      await writeManifest(options, manifest);
      // Per style, not just per run: a long run lands each haircut in the
      // running app as it finishes instead of all of them at the end.
      await writeRenderModule({ root: ROOT, out: options.out });
      console.log(
        `  ✓ [${done}/${todo.length}] ${job.label} -> ${relative(options, job.file)}` +
          `${options.sheet ? ` (+${options.angles.length} views)` : ''}`,
      );
    } catch (error) {
      failures.push({ job: job.label, message: error.message });
      console.error(`  ✗ ${job.label}: ${error.message.slice(0, 300)}`);
    }
  });

  if (options.dryRun) return;

  console.log(`\nManifest: ${manifestPath(options)}`);
  console.log(`Contact sheet: ${await writeContactSheet(options, manifest, catalog)}`);
  await syncRenders(options);

  if (incomplete.length) {
    // These wrote a file, so a plain re-run would skip them — the redo needs
    // --force, and it is spelled out rather than left to be worked out.
    const ids = dedupeIds(incomplete.map(({ job }) => job.style.id));
    console.error(
      `\n${incomplete.length} sheet(s) came back with a bald view. ` +
        'They were kept as they are, so look at them in the contact sheet before paying to redo them:',
    );
    for (const { job, bald } of incomplete) console.error(`  ${job.label}: ${bald.join(', ')}`);
    console.error(`\n  node scripts/generate-mannequins.mjs --sheet --force --style ${ids.join(',')}`);
    process.exitCode = 1;
  }

  if (failures.length) {
    console.error(`\n${failures.length} image(s) failed — re-running the same command retries only those:`);
    for (const failure of failures) console.error(`  ${failure.job}: ${failure.message.slice(0, 200)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
