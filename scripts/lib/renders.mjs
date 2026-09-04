/**
 * Keeps the app's render map in step with what is on disk.
 *
 * The generator writes PNGs into
 * `assets/mannequins/<style>/<variant>/<gender>-<angle>.png`,
 * but Metro only bundles an asset that some module actually `require`s, and a
 * require path has to be a literal. So the bridge between "a file exists" and
 * "the UI shows it" is this module: it scans the output directory and rewrites
 * `src/api/mannequinRenders.generated.ts` with one require per file.
 *
 * It runs at the end of every generator run (and on `npm start`), so a finished
 * style appears in the app on its own — Metro sees the regenerated module,
 * fast-refreshes, and `<Mannequin>` starts preferring the render over the
 * procedural drawing. Styles generated earlier stay in the map: it is rebuilt
 * from the whole directory every time, never appended to.
 *
 * Hair masks are part of that bridge. A render is only fully usable once the app
 * can tell hair from mannequin in it — the colour grade has to stay off the head
 * — so any render whose mask is missing or older than it gets one computed here,
 * before the module that points at it is written. That keeps "what is on disk is
 * what the app shows" true for masks as well as renders.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hairMask } from './hairMask.mjs';
import { ANCHOR_LENGTH, HAIR_LENGTH_IDS, lengthDir, lengthsOf } from './lengths.mjs';
import { decodePng, encodePng } from './png.mjs';
import { SHEET } from './sheet.mjs';
import { variantsOf } from './variants.mjs';

/** The angles the app can display — the sheet's panels, in sheet order. */
export const RENDER_ANGLES = SHEET.cells;
export const RENDER_GENDERS = ['male', 'female'];

/**
 * The variant directories a style may hold — one per distinct render the
 * hairstyle × hair type matrix asks for, plus `any` for the styles the matrix
 * says need only one. Which of these a given style actually uses is decided by
 * its `variants` row in the catalog, never here.
 */
export const RENDER_VARIANTS = ['any', 'straight', 'wavy', 'curly', 'coily'];

/**
 * The lengths a variant directory may hold, and where each one lives.
 *
 * The anchor has no directory: it *is* the variant directory. Every render shot
 * before length existed came from a prompt that says nothing about it, so what
 * sits loose in `<style>/<variant>/` is the cut as the catalog authored it —
 * which is exactly what `medium` names. Nesting it would mean moving 356 renders
 * and their masks to say something that was already true, and would put every
 * style with no length row at all into a `medium/` folder that means nothing to
 * it. So only `short` and `long` are directories, and a style with no length
 * dimension simply has one length: its anchor.
 */
export const RENDER_LENGTHS = HAIR_LENGTH_IDS;
export const LENGTH_DIRS = HAIR_LENGTH_IDS.filter((id) => id !== ANCHOR_LENGTH);

const isLengthDir = (entry) => entry.isDirectory() && LENGTH_DIRS.includes(entry.name);

/**
 * `male-half.png` and friends. The composed `<gender>-sheet.png` is not a view,
 * and neither is `male-half-mask.png` — the anchored `.png` excludes both.
 */
const FILE_PATTERN = new RegExp(`^(${RENDER_GENDERS.join('|')})-(${RENDER_ANGLES.join('|')})\.png$`);

const isVariantDir = (entry) => entry.isDirectory() && RENDER_VARIANTS.includes(entry.name);

const MODULE_PATH = ['src', 'api', 'mannequinRenders.generated.ts'];

/** `male-half.png` -> `male-half-mask.png`. */
export const maskFileFor = (file) => file.replace(/\.png$/, '-mask.png');

/** Directory name -> hairstyle id. `_base` and other underscore dirs are not styles. */
const isStyleDir = (entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.');

/**
 * Reads `<out>` and returns
 * `{ [styleId]: { [variant]: { [length]: { [gender]: { [angle]: absolutePath } } } } }`,
 * with only the files that actually exist.
 *
 * A style directory holds one subdirectory per generated variant, so a catalog
 * part-way through a hair-type batch is a mix of variants rather than a mix of
 * layouts. A variant directory holds the anchor renders loose plus an optional
 * `short/` and `long/` — see `RENDER_LENGTHS`. Anything else sitting loose in
 * the style directory is ignored: it is either a pre-variant render
 * (`npm run mannequins:sync` reports those) or not a view at all.
 */
export async function scanRenders(out) {
  const styles = {};
  let entries;
  try {
    entries = await readdir(out, { withFileTypes: true });
  } catch {
    return styles;
  }

  const collect = async (styleId, variant, length, dir) => {
    let files;
    try {
      files = (await readdir(dir)).sort();
    } catch {
      return;
    }
    for (const file of files) {
      const match = FILE_PATTERN.exec(file);
      if (!match) continue;
      const [, gender, angle] = match;
      ((((styles[styleId] ??= {})[variant] ??= {})[length] ??= {})[gender] ??= {})[angle] = path.join(dir, file);
    }
  };

  for (const entry of entries.filter(isStyleDir).sort((a, b) => a.name.localeCompare(b.name))) {
    const styleDir = path.join(out, entry.name);
    const variants = (await readdir(styleDir, { withFileTypes: true }))
      .filter(isVariantDir)
      .sort((a, b) => RENDER_VARIANTS.indexOf(a.name) - RENDER_VARIANTS.indexOf(b.name));

    for (const variant of variants) {
      const dir = path.join(styleDir, variant.name);
      // The anchor first, then whichever length directories exist beside it.
      await collect(entry.name, variant.name, ANCHOR_LENGTH, dir);
      const nested = (await readdir(dir, { withFileTypes: true })).filter(isLengthDir);
      for (const length of nested) {
        await collect(entry.name, variant.name, length.name, path.join(dir, length.name));
      }
    }
  }
  return styles;
}

/**
 * Every render directory the catalog can ever write into, as `<style>/<variant>`
 * and `<style>/<variant>/<length>` paths relative to the output directory.
 *
 * Derived from the catalog's own `variants` and `lengths` rows, so it holds no
 * opinion about any hairstyle and grows on its own when one is added.
 */
export function renderDirs(catalog) {
  const dirs = new Set();
  for (const style of catalog?.hairstyles ?? []) {
    for (const variant of variantsOf(style)) {
      dirs.add(`${style.id}/${variant}`);
      for (const gender of style.genders ?? []) {
        for (const length of lengthsOf(style, gender)) {
          const dir = lengthDir(length);
          if (dir) dirs.add(`${style.id}/${variant}/${dir}`);
        }
      }
    }
  }
  return [...dirs].sort();
}

/**
 * Creates all of those directories, empty, ahead of time.
 *
 * This exists for one reason and it is a Metro bug on Windows, not a tidiness
 * preference. `NativeWatcher.isSupported()` in metro-file-map is `platform() ===
 * 'darwin'`, so on Windows and Linux Metro falls back to `FallbackWatcher`: one
 * non-recursive `fs.watch` per directory, recursion done by hand. When a
 * directory appears, the watcher lstats it, then `recReaddir`s it to start
 * watching it *and* to register the files it finds **at that instant**. A file
 * created in the window between that walk and the watch being established is
 * never registered, and no later event fires for it — it is invisible to the
 * bundler until the next full crawl, which means until the dev server restarts.
 *
 * `--lengths` is the one thing here that creates directories while the server is
 * running: it makes `short/` and `long/` and writes four panels into each within
 * milliseconds. The first panels win the race, the last ones lose it, and then
 * `writeRenderModule` emits a require for all four because on disk all four are
 * genuinely there. The result is a bundling failure naming a file you can see
 * with your own eyes — always one of the later angles, never `front`.
 *
 * A directory that already existed when Metro crawled is watched, and files
 * appearing inside a watched directory are picked up reliably. So the fix is to
 * make sure no render directory is ever born mid-session: `npm start` runs the
 * sync, the sync creates the whole tree, and a generator run afterwards only
 * ever drops files into directories the bundler already knows about. The
 * generator does the same thing at the top of a run, for a directory the catalog
 * gained after the server started — there it is the generation latency rather
 * than the crawl that gives the watcher time.
 *
 * Empty directories cost nothing: git does not track them, and every
 * `existsSync` check in the generator is on a file rather than on its directory,
 * so an empty `short/` is not mistaken for work already done.
 *
 * @param {{ out: string, catalog: object }} opts
 * @returns {Promise<string[]>} the directories that did not exist yet
 */
export async function ensureRenderDirs({ out, catalog }) {
  const created = [];
  for (const dir of renderDirs(catalog)) {
    // `mkdir` resolves to the first path it had to make, or undefined if the
    // directory was already there — which is exactly the "is this new?" answer.
    const made = await mkdir(path.join(out, ...dir.split('/')), { recursive: true });
    if (made) created.push(dir);
  }
  return created;
}

/** Every render path in a scan, flattened. */
export const renderFiles = (styles) =>
  Object.values(styles).flatMap((byVariant) =>
    Object.values(byVariant).flatMap((byLength) =>
      Object.values(byLength).flatMap((byGender) =>
        Object.values(byGender).flatMap((views) => Object.values(views)),
      ),
    ),
  );

function render(styles, modulePath, masksOnDisk) {
  const requirePath = (file) => {
    const rel = path.relative(path.dirname(modulePath), file).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
  };

  /**
   * Both maps have the same shape and the same gaps, so they are built by the
   * same walk: `fileFor` turns a render path into the path to require, or null
   * to leave that view out.
   */
  const mapOf = (fileFor) =>
    Object.keys(styles)
      .map((id) => {
        const variants = RENDER_VARIANTS.filter((variant) => styles[id][variant])
          .map((variant) => {
            const lengths = RENDER_LENGTHS.filter((length) => styles[id][variant][length])
              .map((length) => {
                const byLength = styles[id][variant][length];
                const genders = RENDER_GENDERS.filter((gender) => byLength[gender])
                  .map((gender) => {
                    const views = RENDER_ANGLES.filter((angle) => byLength[gender][angle])
                      .map((angle) => [angle, fileFor(byLength[gender][angle])])
                      .filter(([, file]) => file)
                      .map(([angle, file]) => `          ${angle}: require('${requirePath(file)}'),`)
                      .join('\n');
                    return views ? `        ${gender}: {\n${views}\n        },` : '';
                  })
                  .filter(Boolean)
                  .join('\n');
                return genders ? `      ${length}: {\n${genders}\n      },` : '';
              })
              .filter(Boolean)
              .join('\n');
            return lengths ? `    ${variant}: {\n${lengths}\n    },` : '';
          })
          .filter(Boolean)
          .join('\n');
        return variants ? `  '${id}': {\n${variants}\n  },` : '';
      })
      .filter(Boolean)
      .join('\n');

  const body = mapOf((file) => file);
  const masks = mapOf((file) => (masksOnDisk.has(maskFileFor(file)) ? maskFileFor(file) : null));

  return `/**
 * AUTO-GENERATED by scripts/generate-mannequins.mjs — do not edit by hand.
 *
 * One entry per mannequin render sitting in assets/mannequins/. Regenerate with:
 *
 *   npm run mannequins:sync
 *
 * (every generator run and every \`npm start\` does it for you). Metro can only
 * bundle an asset some module requires by a literal path, which is why this file
 * is code rather than data — it is derived from the directory listing, holds no
 * judgement about any hairstyle, and is read only through
 * \`mannequinRender()\` in src/lib/mannequinRender.ts.
 *
 * These are the local, ahead-of-time catalog renders. The backend's own
 * \`hairstyle.imageUrl\` still wins over them when it is populated.
 */

import type { Gender, HairLengthId, VariantId } from './types';
import type { ViewAngle } from '@/lib/hairShape';

/** What \`require()\` gives back for a bundled image: an asset registry handle. */
export type RenderSource = number;

export type MannequinRenderMap = Partial<Record<Gender, Partial<Record<ViewAngle, RenderSource>>>>;

/**
 * A variant's renders, keyed by length. \`medium\` is the anchor — the cut as the
 * catalog authored it — and it is the only length most styles have, because most
 * styles carry no \`lengths\` row at all. On disk the anchor sits loose in the
 * variant directory and only \`short\` and \`long\` are nested; that asymmetry is
 * deliberate and is explained in scripts/lib/renders.mjs.
 */
export type MannequinLengthMap = Partial<Record<HairLengthId, MannequinRenderMap>>;

/**
 * A style's renders, keyed by the variant of the hairstyle × hair type matrix
 * they were generated for. \`any\` is the single render that serves every type.
 * Which variant a given user should see is decided from the catalog by
 * \`variantCandidates()\` in src/lib/hairTypes.ts, never from this file.
 */
export type MannequinVariantMap = Partial<Record<VariantId, MannequinLengthMap>>;

/** Keyed by hairstyle id — the app never reads a name out of here. */
export const mannequinRenders: Record<string, MannequinVariantMap> = {${body ? `\n${body}\n` : ''}};

/**
 * The matching hair masks: greyscale, white where the haircut is, the same size
 * as the render they belong to. Written by \`scripts/generate-hair-masks.mjs\`
 * and used to keep the colour grade off the mannequin. A render missing from
 * here is graded whole, which is the old behaviour rather than a broken one.
 */
export const mannequinMasks: Record<string, MannequinVariantMap> = {${masks ? `\n${masks}\n` : ''}};
`;
}

/**
 * Rewrites the render module from whatever is currently in `out`.
 * Leaves the file untouched when nothing changed, so Metro does not reload for
 * a run that generated nothing.
 *
 * Calls are serialised: the generator syncs after every finished style so a long
 * run drops each haircut into the running app as it lands, and two workers
 * finishing at once must not write the file over each other.
 *
 * @param {{ root: string, out: string }} opts
 */
export function writeRenderModule(opts) {
  queue = queue.then(
    () => rewrite(opts),
    () => rewrite(opts),
  );
  return queue;
}

/** Serialises `rewrite` — see `writeRenderModule`. */
let queue = Promise.resolve();

async function rewrite({ root, out }) {
  const modulePath = path.join(root, ...MODULE_PATH);
  const styles = await scanRenders(out);

  const files = renderFiles(styles);
  const masked = await ensureHairMasks(files);
  const masksOnDisk = new Set(masked.filter((entry) => entry.mask).map((entry) => entry.mask));

  const source = render(styles, modulePath, masksOnDisk);

  const previous = await readFile(modulePath, 'utf8').catch(() => null);
  if (previous !== source) await writeFile(modulePath, source, 'utf8');

  const variants = Object.values(styles).reduce((total, byVariant) => total + Object.keys(byVariant).length, 0);

  return {
    file: modulePath,
    relativeFile: path.relative(root, modulePath).split(path.sep).join('/'),
    styles: Object.keys(styles).length,
    variants,
    images: files.length,
    masks: masksOnDisk.size,
    maskedNow: masked.filter((entry) => entry.written).length,
    changed: previous !== source,
  };
}

/**
 * Makes sure every render has an up-to-date hair mask beside it.
 *
 * A mask is rebuilt only when it is missing or older than its render, so this is
 * one stat per file on a warm catalog and a few tens of milliseconds per new
 * render. A failure is reported, never thrown: a render whose mask could not be
 * computed still belongs in the app, it is simply graded whole.
 *
 * @param {string[]} files render paths
 * @param {{ force?: boolean }} [opts]
 */
export async function ensureHairMasks(files, { force = false } = {}) {
  return Promise.all(files.map((file) => ensureOneMask(file, force)));
}

async function ensureOneMask(file, force) {
  const mask = maskFileFor(file);

  if (!force) {
    const [source, existing] = await Promise.all([
      stat(file).catch(() => null),
      stat(mask).catch(() => null),
    ]);
    if (existing && source && existing.mtimeMs >= source.mtimeMs) return { file, mask, written: false };
  }

  try {
    const { mask: image, coverage } = hairMask(decodePng(await readFile(file)));
    await writeFile(mask, encodePng(image));
    return { file, mask, written: true, coverage };
  } catch (error) {
    console.warn(`  ! could not mask ${path.basename(file)}: ${error.message}`);
    return { file, mask: null, written: false };
  }
}
