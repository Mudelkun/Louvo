#!/usr/bin/env node
/**
 * Writes a hair mask beside every mannequin render.
 *
 * `assets/mannequins/<style>/<gender>-<angle>.png` gets a
 * `<gender>-<angle>-mask.png`: 8-bit greyscale, white where the haircut is. The
 * app uses it to keep the colour grade off the mannequin — see
 * `scripts/lib/hairMask.mjs` for how the three regions are told apart, and
 * `<Mannequin>` for what is done with the result.
 *
 * Nothing here calls a model and nothing costs anything: it is arithmetic over
 * pixels already on disk. `writeRenderModule` runs it for any render whose mask
 * is missing or older than the render, so a `npm start` or a generator run keeps
 * masks in step on its own; this script is for doing the whole catalog at once,
 * for redoing it after a threshold change, and for looking at the result.
 *
 *   node scripts/generate-hair-masks.mjs
 *   node scripts/generate-hair-masks.mjs --style afro,man-bun --force
 *   node scripts/generate-hair-masks.mjs --preview masks.png
 *
 * `--preview` writes a contact sheet — render, mask, and the render graded to a
 * pale blonde — which is the quickest way to see a mask that is wrong: any part
 * of the mannequin that changes colour in the third column is a mask error.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { hairMask, COVERAGE_CEILING, COVERAGE_FLOOR } from './lib/hairMask.mjs';
import { blankImage, decodePng, encodePng, pasteImage, resizeImage } from './lib/png.mjs';
import { ensureHairMasks, maskFileFor, scanRenders } from './lib/renders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The shade the preview grades to: light enough that any leak is obvious. */
const PREVIEW_TARGET = '#DDD3C4';
const PREVIEW_BASE = '#392D24';
const PREVIEW_CELL = 190;

function parseArgs(argv) {
  const options = {
    out: path.join(ROOT, 'assets', 'mannequins'),
    styles: null,
    force: false,
    preview: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case '--out': options.out = path.resolve(ROOT, next()); break;
      case '--style': case '--styles':
        options.styles = next().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--force': options.force = true; break;
      case '--preview': options.preview = path.resolve(ROOT, next()); break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`unknown option ${arg}`);
    }
  }
  return options;
}

function usage() {
  console.log(`Usage: node scripts/generate-hair-masks.mjs [options]

  --style <ids>     only these hairstyles (comma separated)
  --force           rewrite masks that are already up to date
  --preview <file>  also write a render / mask / graded contact sheet
  --out <dir>       render directory (default assets/mannequins)`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const renders = await scanRenders(options.out);

  const wanted = options.styles ? new Set(options.styles) : null;
  if (wanted) {
    for (const id of wanted) if (!renders[id]) fail(`no renders for "${id}" under ${relative(options.out)}`);
  }

  const files = [];
  for (const [styleId, byVariant] of Object.entries(renders)) {
    if (wanted && !wanted.has(styleId)) continue;
    for (const [variant, byGender] of Object.entries(byVariant)) {
      for (const [gender, views] of Object.entries(byGender)) {
        for (const [angle, file] of Object.entries(views)) {
          files.push({ styleId, variant, gender, angle, file });
        }
      }
    }
  }

  if (!files.length) {
    console.log(`No renders under ${relative(options.out)} — generate some first.`);
    return;
  }

  const results = await ensureHairMasks(files.map((entry) => entry.file), { force: options.force });
  const byFile = new Map(results.map((result) => [result.file, result]));

  let written = 0;
  const suspect = [];
  for (const entry of files) {
    const result = byFile.get(entry.file);
    if (!result) continue;
    if (result.written) written += 1;
    if (result.coverage !== undefined && (result.coverage < COVERAGE_FLOOR || result.coverage > COVERAGE_CEILING)) {
      suspect.push({ ...entry, coverage: result.coverage });
    }
  }

  console.log(
    `${files.length} render(s): ${written} mask(s) written, ${files.length - written} already up to date`,
  );

  // A mask that covers almost nothing or almost everything is not describing a
  // haircut, and is worth a name rather than a silent pass.
  for (const entry of suspect) {
    console.warn(
      `  ! ${entry.styleId} ${entry.variant}/${entry.gender}/${entry.angle}: ` +
        `hair covers ${(entry.coverage * 100).toFixed(1)}% of the frame`,
    );
  }

  if (options.preview) await writePreview(files, options.preview);
}

/** Render | mask | graded, one row per view, for eyeballing the segmentation. */
async function writePreview(files, target) {
  const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const base = hex(PREVIEW_BASE);
  const factors = hex(PREVIEW_TARGET).map((t, i) => (1 - t) / (1 - base[i]));

  const cells = [];
  for (const entry of files) {
    const image = decodePng(await readFile(entry.file));
    const mask = decodePng(await readFile(maskFileFor(entry.file)));
    const { channels } = image;

    const maskRgb = blankImage(image.width, image.height, channels, image.colorType, 0);
    const graded = { ...image, pixels: Buffer.from(image.pixels) };
    for (let i = 0; i < image.width * image.height; i += 1) {
      const a = mask.pixels[i * mask.channels] / 255;
      for (let k = 0; k < 3; k += 1) {
        maskRgb.pixels[i * channels + k] = mask.pixels[i * mask.channels];
        const x = image.pixels[i * channels + k] / 255;
        const y = Math.max(0, Math.min(1, 1 - factors[k] * (1 - x)));
        graded.pixels[i * channels + k] = Math.round((a * y + (1 - a) * x) * 255);
      }
    }

    cells.push(
      resizeImage(image, PREVIEW_CELL),
      resizeImage(maskRgb, PREVIEW_CELL),
      resizeImage(graded, PREVIEW_CELL),
    );
  }

  const columns = 3;
  const rows = Math.ceil(cells.length / columns);
  const sheet = blankImage(columns * PREVIEW_CELL, rows * PREVIEW_CELL, cells[0].channels, cells[0].colorType, 0xff);
  cells.forEach((cell, i) => {
    pasteImage(sheet, cell, (i % columns) * PREVIEW_CELL, Math.floor(i / columns) * PREVIEW_CELL);
  });

  await writeFile(target, encodePng(sheet));
  console.log(`Preview: ${relative(target)} — render, mask, graded to ${PREVIEW_TARGET}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
