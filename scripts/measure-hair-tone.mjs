#!/usr/bin/env node
/**
 * Measures the hair tone of the generated catalog.
 *
 * This is where the `BASE_HAIR_COLORS` anchors in `src/lib/constants.ts` come
 * from. The app's colour grade maps a render's own hair tone onto whatever shade
 * the user picked, so the anchor has to be what the model actually returned, not
 * the colour `HAIR_COLOURS` in lib/prompts.mjs asked it for — the two are a
 * shade apart in practice.
 *
 * Measured **per variant**, because the catalog is no longer shot in one shade:
 * the coily variant is shot in black and everything else in espresso, so one
 * mean across the whole directory would describe neither of them. Run it after
 * shooting a batch and paste each mean into the matching entry:
 *
 *   node scripts/measure-hair-tone.mjs
 *
 * Hair is told from mannequin with the same luma threshold the sheet inspector
 * uses (`HAIR_LUMA` in lib/sheet.mjs), so "hair" means the same thing here as it
 * does when a bald panel is detected.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodePng } from './lib/png.mjs';
import { HAIR_LUMA } from './lib/sheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDERS = path.join(ROOT, 'assets', 'mannequins');

/** Above this a pixel is the white ground, reported as a sanity check. */
const WHITE_LUMA = 235;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')}`;

/** A running mean for one variant. */
const emptyTotals = () => ({
  hair: [0, 0, 0],
  white: [0, 0, 0],
  hairCount: 0,
  whiteCount: 0,
  files: 0,
  styles: new Set(),
});

/** Adds one render's hair and backdrop pixels into a variant's running totals. */
function accumulate(image, totals) {
  const { pixels, channels, width, height } = image;
  totals.files += 1;

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * channels;
    const r = pixels[offset];
    const g = channels > 2 ? pixels[offset + 1] : r;
    const b = channels > 2 ? pixels[offset + 2] : r;
    if (channels === 4 && pixels[offset + 3] < 200) continue;

    const l = luma(r, g, b);
    if (l < HAIR_LUMA) {
      totals.hair[0] += r;
      totals.hair[1] += g;
      totals.hair[2] += b;
      totals.hairCount += 1;
    } else if (l > WHITE_LUMA) {
      totals.white[0] += r;
      totals.white[1] += g;
      totals.white[2] += b;
      totals.whiteCount += 1;
    }
  }
}

async function main() {
  const dirs = (await readdir(RENDERS, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('_'),
  );

  const totals = new Map();

  for (const dir of dirs) {
    const variants = (await readdir(path.join(RENDERS, dir.name), { withFileTypes: true })).filter((entry) =>
      entry.isDirectory(),
    );

    for (const variant of variants) {
      if (!totals.has(variant.name)) totals.set(variant.name, emptyTotals());
      const bucket = totals.get(variant.name);
      bucket.styles.add(dir.name);

      // Sheets are the same four panels again and masks are not photographs;
      // counting either would skew the mean.
      const pngs = (await readdir(path.join(RENDERS, dir.name, variant.name))).filter(
        (name) => name.endsWith('.png') && !name.includes('sheet') && !name.includes('mask'),
      );

      for (const name of pngs) {
        accumulate(decodePng(await readFile(path.join(RENDERS, dir.name, variant.name, name))), bucket);
      }
    }
  }

  const found = [...totals.entries()].filter(([, bucket]) => bucket.hairCount);
  if (!found.length) {
    console.error(`No hair pixels found under ${RENDERS} — generate the catalog first.`);
    process.exitCode = 1;
    return;
  }

  for (const [variant, bucket] of found) {
    const mean = (channel, count) => hex(channel.map((v) => v / count));
    console.log(`\n${variant}  —  ${bucket.files} render(s) across ${bucket.styles.size} style(s)`);
    console.log(`  hair mean:  ${mean(bucket.hair, bucket.hairCount)}  (${bucket.hairCount.toLocaleString()} px)`);
    console.log(`  white mean: ${mean(bucket.white, bucket.whiteCount)}  (${bucket.whiteCount.toLocaleString()} px)`);
  }

  console.log('\nPaste each hair mean into the matching BASE_HAIR_COLORS entry in src/lib/constants.ts.');
  console.log('Every white mean should stay near #FFFFFF — the grade leaves white where it is,');
  console.log('which is what keeps it off the mannequin and the background.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
