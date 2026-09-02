#!/usr/bin/env node
/**
 * Measures the hair tone of the generated catalog.
 *
 * This is where `BASE_HAIR_COLOR.hex` in `src/lib/constants.ts` comes from. The
 * app's colour grade maps the render's own hair tone onto whatever shade the
 * user picked, so the anchor has to be what the model actually returned, not the
 * colour `HAIR_COLOUR` in lib/prompts.mjs asked it for — the two are a shade
 * apart in practice.
 *
 * Run it after re-shooting the catalog in a different shade, and paste the mean
 * it prints into `BASE_HAIR_COLOR`:
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

async function main() {
  const dirs = (await readdir(RENDERS, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('_'),
  );

  const hair = [0, 0, 0];
  const white = [0, 0, 0];
  let hairCount = 0;
  let whiteCount = 0;
  let files = 0;

  for (const dir of dirs) {
    // Sheets are the same four panels again; counting them would weight the
    // measurement towards styles that still have their uncut sheet on disk.
    const pngs = (await readdir(path.join(RENDERS, dir.name))).filter(
      (name) => name.endsWith('.png') && !name.includes('sheet'),
    );

    for (const name of pngs) {
      const image = decodePng(await readFile(path.join(RENDERS, dir.name, name)));
      const { pixels, channels, width, height } = image;
      files += 1;

      for (let i = 0; i < width * height; i += 1) {
        const offset = i * channels;
        const r = pixels[offset];
        const g = channels > 2 ? pixels[offset + 1] : r;
        const b = channels > 2 ? pixels[offset + 2] : r;
        if (channels === 4 && pixels[offset + 3] < 200) continue;

        const l = luma(r, g, b);
        if (l < HAIR_LUMA) {
          hair[0] += r;
          hair[1] += g;
          hair[2] += b;
          hairCount += 1;
        } else if (l > WHITE_LUMA) {
          white[0] += r;
          white[1] += g;
          white[2] += b;
          whiteCount += 1;
        }
      }
    }
  }

  if (!hairCount) {
    console.error(`No hair pixels found under ${RENDERS} — generate the catalog first.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${files} render(s) across ${dirs.length} style(s)`);
  console.log(`hair mean:  ${hex(hair.map((v) => v / hairCount))}  (${hairCount.toLocaleString()} px)`);
  console.log(`white mean: ${hex(white.map((v) => v / whiteCount))}  (${whiteCount.toLocaleString()} px)`);
  console.log('\nPaste the hair mean into BASE_HAIR_COLOR.hex in src/lib/constants.ts.');
  console.log('The white mean should stay near #FFFFFF — the grade leaves white where it is,');
  console.log('which is what keeps it off the mannequin and the background.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
