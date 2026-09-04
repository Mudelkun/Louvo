#!/usr/bin/env node
/**
 * Rebuilds `src/api/mannequinRenders.generated.ts` from whatever mannequin PNGs
 * are on disk, so the app shows every style that has been generated.
 *
 * "Whatever is on disk" is now per variant of the hairstyle × hair type matrix
 * — `<style>/<variant>/<gender>-<angle>.png` — so a catalog part-way through a
 * hair-type batch shows the variants it has and falls back to the procedural
 * drawing for the ones it does not.
 *
 * The generator calls this itself at the end of a run; it is also wired to
 * `prestart`, so a `npm start` picks up renders that arrived some other way
 * (a teammate's commit, a hand-dropped file). It calls no model and costs
 * nothing: a directory listing, plus a hair mask computed locally for any render
 * that is missing one (see scripts/generate-hair-masks.mjs).
 *
 * Being wired to `prestart` is also what makes it the right place to create the
 * render directory tree, empty, before Metro's first crawl. Metro's Windows and
 * Linux watcher loses files written into a directory that was created after the
 * crawl, which is every `--lengths` run against a running dev server — see
 * `ensureRenderDirs` in lib/renders.mjs for the mechanism. Creating the tree
 * here means no render directory is ever born mid-session.
 *
 *   node scripts/sync-mannequin-renders.mjs [--out assets/mannequins]
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './lib/catalog.mjs';
import { ensureRenderDirs, writeRenderModule } from './lib/renders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const outIndex = argv.findIndex((arg) => arg === '--out');
const out = path.resolve(ROOT, outIndex >= 0 ? argv[outIndex + 1] : path.join('assets', 'mannequins'));
const quiet = argv.includes('--quiet');

// Never fatal: this runs on `prestart`, and a catalog that will not load is a
// reason to skip the directory tree, not a reason to block `npm start`.
let created = [];
try {
  created = await ensureRenderDirs({ out, catalog: await loadCatalog({ root: ROOT }) });
} catch (error) {
  if (!quiet) console.warn(`  ! could not pre-create render directories: ${error.message}`);
}

const result = await writeRenderModule({ root: ROOT, out });

if (!quiet) {
  const masks = result.maskedNow ? `, ${result.maskedNow} hair mask(s) written` : '';
  const dirs = created.length ? `, ${created.length} render dir(s) created` : '';
  console.log(
    `${result.relativeFile}: ${result.images} render(s) across ${result.variants} variant(s) ` +
      `of ${result.styles} style(s)${masks}${dirs}${result.changed ? '' : ' (unchanged)'}`,
  );
}
