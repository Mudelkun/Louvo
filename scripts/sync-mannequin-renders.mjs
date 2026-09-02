#!/usr/bin/env node
/**
 * Rebuilds `src/api/mannequinRenders.generated.ts` from whatever mannequin PNGs
 * are on disk, so the app shows every style that has been generated.
 *
 * The generator calls this itself at the end of a run; it is also wired to
 * `prestart`, so a `npm start` picks up renders that arrived some other way
 * (a teammate's commit, a hand-dropped file). It calls no model and costs
 * nothing: a directory listing, plus a hair mask computed locally for any render
 * that is missing one (see scripts/generate-hair-masks.mjs).
 *
 *   node scripts/sync-mannequin-renders.mjs [--out assets/mannequins]
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { writeRenderModule } from './lib/renders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const outIndex = argv.findIndex((arg) => arg === '--out');
const out = path.resolve(ROOT, outIndex >= 0 ? argv[outIndex + 1] : path.join('assets', 'mannequins'));
const quiet = argv.includes('--quiet');

const result = await writeRenderModule({ root: ROOT, out });

if (!quiet) {
  const masks = result.maskedNow ? `, ${result.maskedNow} hair mask(s) written` : '';
  console.log(
    `${result.relativeFile}: ${result.images} render(s) across ${result.styles} style(s)` +
      `${masks}${result.changed ? '' : ' (unchanged)'}`,
  );
}
