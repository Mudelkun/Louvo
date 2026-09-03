#!/usr/bin/env node
/**
 * Runs one preview from the command line: a photo, a hairstyle, and the result.
 *
 * The app does this on a phone, in the background, behind a progress ring. That
 * is a slow and expensive place to find out a prompt is wrong, so this is the
 * same request with the phone taken out of it: the instruction comes from
 * `src/lib/tryOnPrompt.ts`, imported rather than copied (see
 * `lib/transpile.mjs`), and the reference is the same mannequin render
 * `<Mannequin>` puts on the catalog card.
 *
 * It sends what the app sends, model included: both are on
 * `fal-ai/nano-banana-2/edit` again. That was not true while the app ran
 * gpt-image-2 at about $0.20 a preview and this script stayed on the cheaper
 * nano-banana to keep a prompt-writing loop affordable — wording transfers
 * between models, behaviour does not, so every prompt written here had to be
 * re-confirmed against the app's model before it was believed. It does not have
 * to be any more; `--model` still exists for measuring one against another.
 *
 *   node scripts/try-on.mjs --photo me.jpg --style buzz-cut
 *   node scripts/try-on.mjs --photo me.jpg --style afro --hair-type coily
 *   node scripts/try-on.mjs --photo me.jpg --style crew-cut --dry-run
 *   node scripts/try-on.mjs --photo me.jpg --style buzz-cut --no-reference
 *
 * `--dry-run` prints the prompt and what would be sent, and calls nothing. It is
 * free, and it is the right way to iterate on wording.
 *
 * `--views` is the other knob, and the one that matters most: the app sends a
 * single reference view because sending four turned the request into a
 * composition across five images and the photograph lost. Changing it here is
 * how that gets re-measured rather than re-argued.
 *
 * `--no-reference` is the far end of that same axis — no reference image at all,
 * the cut carried into the request by its name and description alone. That is
 * the prompt's existing fallback for a style with no render yet (`tryOnPrompt`
 * with no views), which until now was only ever reached by accident, and what it
 * measures is what the reference is actually buying: described rather than
 * shown, a "mid fade" is whatever the model already thinks a mid fade is, and a
 * different one each run.
 *
 * Needs FAL_KEY in the environment (or .env.local) unless dry-running.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './lib/catalog.mjs';
import { fetchImageBytes, firstImage, runModel } from './lib/fal.mjs';
import { RENDER_ANGLES } from './lib/renders.mjs';
import { loadTsModule } from './lib/transpile.mjs';
import { variantsOf } from './lib/variants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAIR_TYPES = ['straight', 'wavy', 'curly', 'coily'];

// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(
    [
      'Generate one try-on preview from a photo.',
      '',
      '  --photo <file>       the photograph to put the haircut on   (required)',
      '  --style <id>         hairstyle id from the catalog          (required)',
      '  --hair-type <t>      straight | wavy | curly | coily        (default: whatever is generated)',
      '  --views <a,b>        which angles to send as reference       (default: half — see below)',
      '  --no-reference       send no reference image; describe the cut instead',
      '  --gender <g>         male | female                          (default: male)',
      '  --out <file>         where to write the result              (default: try-on-<style>-<model>.png)',
      '  --model <id>         image-edit model                       (default: openai/gpt-image-2/edit)',
      '  --quality <q>        gpt-image only: low | medium | high    (default: medium, as the app)',
      "  --image-size <s>     gpt-image only: match | WxH | auto     (default: match, as the app)",
      "  --resolution <r>     nano-banana only: 0.5K | 1K | 2K | 4K  (default: 2K, as the app)",
      '  --dry-run            print the prompt and send nothing',
      '  --styles             list the hairstyle ids that have renders',
      '',
      'The same model as the app: openai/gpt-image-2/edit at medium quality and',
      '1920x1088, about $0.053 a preview. gpt-image prices by tier and by size, so',
      '--quality and --image-size move the cost far more than --model does:',
      '',
      '  --quality high                     ~$0.158, the API default',
      '  --quality low                      ~$0.017, and visibly so',
      '  --image-size 1024x1536             a fixed portrait frame',
      '',
      "'match' is the app's default and asks for the photograph's own shape at a",
      'fixed pixel budget, so the preview wipes cleanly against the original in the',
      'app instead of being cropped to a different framing. Same arithmetic as the',
      'app, from the same file: src/lib/imageSize.ts.',
      '  --model fal-ai/nano-banana-2/edit  the catalog generators\' model, $0.12 at 2K',
      '',
      'Sizing flags are selected by model exactly as the app selects them: --quality',
      'and --image-size are sent to gpt-image only, --resolution to nano-banana only.',
      '',
      'The model is in the default output filename, so two do not overwrite each',
      'other.',
      '',
      'The app sends ONE reference view. Sending four made the model compose across',
      'the image set instead of editing the photo: it returned a stranger, on the',
      "mannequin's own background, at the mannequin's crop. --views exists to",
      're-measure that, not to undo it.',
      '',
      '  --views half                   what the app does',
      '  --views front,half,side,back   the failure, reproducible',
      '  --no-reference                 the other end: name and description only',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const options = {
    photo: null,
    style: null,
    hairType: null,
    gender: 'male',
    views: ['half'],
    out: null,
    // The app's model (`TRY_ON_MODEL` in src/api/tryOn.ts), which restores the
    // guarantee in the module header: a script whose job is to test what the app
    // sends now sends the app's generation as well as the app's prompt. It read
    // a cheaper model for as long as the app ran gpt-image-2 at 2.5x the price
    // and a prompt loop meant dozens of runs.
    //
    // `FAL_EDIT_MODEL` is the generators' variable and is still not read here:
    // one switch moving both would re-point a generator whose model change means
    // re-shooting 103 renders.
    model: process.env.FAL_TRY_ON_MODEL ?? 'openai/gpt-image-2/edit',
    // The app's sizing as well (`TRY_ON_QUALITY`, `TRY_ON_IMAGE_SIZE` and
    // `TRY_ON_RESOLUTION` in src/api/tryOn.ts), and for the same reason as the
    // model: detail is most of what separates grown hair from moulded hair, and
    // on gpt-image the quality tier moves both the detail and the price by more
    // than anything else in the request. A prompt judged at another tier is
    // being judged against an image the app does not send.
    quality: process.env.FAL_TRY_ON_QUALITY ?? 'medium',
    imageSize: process.env.FAL_TRY_ON_IMAGE_SIZE ?? 'match',
    resolution: process.env.FAL_TRY_ON_RESOLUTION ?? '2K',
    dryRun: false,
    list: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      return value;
    };

    switch (arg) {
      case '--photo': options.photo = path.resolve(ROOT, next()); break;
      case '--style': options.style = next(); break;
      case '--hair-type': options.hairType = next(); break;
      case '--gender': options.gender = next(); break;
      case '--views':
        options.views = next().split(',').map((entry) => entry.trim()).filter(Boolean);
        break;
      case '--no-reference': options.views = []; break;
      case '--out': options.out = path.resolve(ROOT, next()); break;
      case '--model': options.model = next(); break;
      case '--quality': options.quality = next(); break;
      case '--image-size': options.imageSize = next(); break;
      case '--resolution': options.resolution = next(); break;
      case '--dry-run': options.dryRun = true; break;
      case '--styles': options.list = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`unknown argument ${arg}`);
    }
  }

  if (options.hairType && !HAIR_TYPES.includes(options.hairType)) {
    fail(`--hair-type must be one of ${HAIR_TYPES.join(', ')}`);
  }
  if (!['male', 'female'].includes(options.gender)) fail('--gender must be male or female');
  if (options.quality && !['auto', 'low', 'medium', 'high'].includes(options.quality)) {
    fail('--quality must be auto, low, medium or high');
  }
  // fal rejects an edge that is not a multiple of 16, and it does so after the
  // upload — so it is checked here, where it costs nothing, rather than there.
  const size = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(options.imageSize.trim());
  if (size && (size[1] % 16 || size[2] % 16)) {
    fail(`--image-size ${options.imageSize}: both edges must be multiples of 16`);
  }
  const unknown = options.views.filter((view) => !RENDER_ANGLES.includes(view));
  if (unknown.length) fail(`--views: no such angle ${unknown.join(', ')} (${RENDER_ANGLES.join(', ')})`);
  return options;
}

/**
 * Reads FAL_KEY out of .env.local the way the other generators do, so the key
 * lives in one place. `EXPO_PUBLIC_FAL_KEY` is the app's copy of the same key
 * and is accepted as a fallback rather than being a second thing to configure.
 */
async function loadKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  try {
    const env = await readFile(path.join(ROOT, '.env.local'), 'utf8');
    const match = /^\s*(?:EXPO_PUBLIC_)?FAL_KEY\s*=\s*(.+)$/m.exec(env);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // No .env.local is fine; the error below says what to do.
  }
  return null;
}

/**
 * Which render of this cut the user would be shown, and where its views are.
 *
 * The same resolution the app does, and it has to stay the same: a hair type
 * maps to *a variant*, not to a directory of that name, so a cut whose coily
 * version is the same render as its curly one resolves to `curly`. Matching
 * directories instead would report a style as ungenerated when it is not.
 */
async function resolveReference(style, gender, hairType, exists, angles = RENDER_ANGLES) {
  // The declared type's variant first, then every other variant of the same cut
  // — the app does the same, and for the reason spelled out beside
  // `REFERENCE_VIEWS` in src/api/tryOn.ts: a render of the wrong texture is
  // still the right geometry, and the texture is corrected in words.
  const preferred = hairType ? [style.variants?.[hairType]].filter(Boolean) : [];
  const wanted = [...preferred, ...variantsOf(style).filter((v) => !preferred.includes(v))];

  for (const variant of wanted) {
    const dir = path.join(ROOT, 'assets', 'mannequins', style.id, variant);
    // Existence is checked across every angle so a variant is picked by whether
    // it was generated at all, then the result is narrowed to what was asked
    // for — the same order `generateTryOn` does it in.
    const found = [];
    for (const angle of RENDER_ANGLES) {
      const file = path.join(dir, `${gender}-${angle}.png`);
      if (await exists(file)) found.push({ angle, file });
    }
    if (found.length) return { variant, views: found.filter((view) => angles.includes(view.angle)) };
  }
  return { variant: null, views: [] };
}

const dataUri = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;

// ---------------------------------------------------------------------------

const options = parseArgs(process.argv.slice(2));
const { stat } = await import('node:fs/promises');
const exists = async (file) => !!(await stat(file).catch(() => null));

const catalog = await loadCatalog({ root: ROOT, catalogUrl: process.env.CATALOG_URL ?? null });

if (options.list) {
  for (const style of catalog.hairstyles) {
    const { views } = await resolveReference(style, options.gender, null, exists);
    if (views.length) console.log(`${style.id.padEnd(24)} ${views.length} view(s)`);
  }
  process.exit(0);
}

if (!options.photo) fail('--photo is required (try --help)');
if (!options.style) fail('--style is required (--styles lists them)');

const style = catalog.hairstyles.find((entry) => entry.id === options.style);
if (!style) fail(`no hairstyle "${options.style}" in the catalog (--styles lists them)`);
if (!(await exists(options.photo))) fail(`no such file: ${options.photo}`);

if (options.hairType && !style.variants?.[options.hairType]) {
  fail(`${style.id} is not offered for ${options.hairType} hair — see the matrix (npm run mannequins -- --matrix)`);
}

const { tryOnPrompt } = await loadTsModule({ root: ROOT, file: 'src/lib/tryOnPrompt.ts' });
// Imported for the same reason as the prompt: a script that exists to send what
// the app sends must not compute the output size from a second copy of the rule.
// `imageSize.ts` qualifies for the transpile trick because it has no imports.
const { fitOutputSize } = await loadTsModule({ root: ROOT, file: 'src/lib/imageSize.ts' });

// No angles asked for means no reference at all, and the variant has to go with
// it: `tryOnPrompt` reads the variant to say which texture the reference was
// shot on, and there is no reference for it to be saying that about. Left in, it
// would describe an image that is not in the request.
const { variant, views } = options.views.length
  ? await resolveReference(style, options.gender, options.hairType, exists, options.views)
  : { variant: null, views: [] };
const prompt = tryOnPrompt({
  hairstyle: style,
  gender: options.gender,
  hairType: options.hairType,
  variant,
  views: views.map((view) => view.angle),
  // No colour picker in the app, so a preview keeps the subject's own colour.
  color: null,
});

/**
 * A photograph's pixel dimensions, read straight out of its header.
 *
 * The app calls `Image.getSize`, which needs a platform to decode the file.
 * Node has none and this only ever needs two numbers, so the two bytes-pairs
 * that carry them are read directly — PNG's IHDR, and JPEG's first real frame
 * header. Anything else returns null and the request goes out without a size,
 * which is the same fallback the app takes.
 */
function pixelSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < buffer.length) {
      if (buffer[pos] !== 0xff) {
        pos += 1;
        continue;
      }
      const marker = buffer[pos + 1];
      // SOF0-SOF15 carry the frame size; C4/C8/CC share the range and do not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(pos + 5), width: buffer.readUInt16BE(pos + 7) };
      }
      pos += 2 + buffer.readUInt16BE(pos + 2);
    }
  }

  return null;
}

/**
 * The sizing fields, named the way the selected model names them.
 *
 * A mirror of `modelOptions()` in src/api/tryOn.ts, and mirrored for the reason
 * this whole script exists: it must send what the app sends. The names do not
 * overlap between the two models, so the fields are selected rather than sent
 * hopefully — a request that fails schema validation is a wasted upload here and
 * a failed generation in the app.
 *
 * The one piece of arithmetic that is *not* mirrored is `fitOutputSize`, which
 * is imported from `src/lib/imageSize.ts`. A second copy of that rule is a
 * second answer to "what shape should this come back", which is the bug it was
 * written to fix.
 */
function modelOptions(opts, photoSize) {
  if (opts.model.startsWith('openai/gpt-image')) {
    const raw = opts.imageSize.trim();
    const size = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(raw);
    const imageSize = raw === 'match'
      ? fitOutputSize(photoSize)
      : size
        ? { width: Number(size[1]), height: Number(size[2]) }
        : raw;
    return {
      ...(opts.quality ? { quality: opts.quality } : {}),
      ...(imageSize ? { image_size: imageSize } : {}),
    };
  }
  return opts.resolution ? { resolution: opts.resolution } : {};
}

/** What the sizing fields amount to, for the readout. */
function sizingSummary(opts, photoSize) {
  const fields = modelOptions(opts, photoSize);
  if (!Object.keys(fields).length) return 'model default';
  const size = fields.image_size;
  return [
    fields.quality && `quality ${fields.quality}`,
    size && `size ${typeof size === 'string' ? size : `${size.width}x${size.height}`}`,
    fields.resolution && `resolution ${fields.resolution}`,
  ]
    .filter(Boolean)
    .join(', ');
}

const photoBytes = await readFile(options.photo);
const referenceBytes = await Promise.all(views.map((view) => readFile(view.file)));
const payload = photoBytes.length + referenceBytes.reduce((total, buffer) => total + buffer.length, 0);

console.log(`style      ${style.id} (${style.name})`);
const noVariant = options.views.length
  ? 'none generated — the prompt falls back to the description'
  : 'not sent (--no-reference) — the prompt describes the cut instead';
console.log(`variant    ${variant ?? noVariant}`);
console.log(`hair type  ${options.hairType ?? 'not declared'}`);
console.log(`reference  ${views.map((view) => view.angle).join(', ') || 'none'}`);
const photoSize = pixelSize(photoBytes);
const measured = photoSize ? `${photoSize.width}x${photoSize.height}` : 'unmeasured';
console.log(
  `photo      ${path.relative(ROOT, options.photo)} (${kb(photoBytes.length)}, ${measured})`,
);
console.log(`payload    ${kb(payload)} before base64, ~${kb(payload * 1.34)} after`);
console.log(`model      ${options.model}`);
console.log(`sizing     ${sizingSummary(options, photoSize)}`);
console.log('');
console.log(prompt);
console.log('');

if (options.dryRun) {
  console.log('(--dry-run: nothing sent)');
  process.exit(0);
}

const key = await loadKey();
if (!key) fail('FAL_KEY is not set — put it in .env.local or the environment');

console.log(`sending to ${options.model}…`);
const result = await runModel(
  options.model,
  {
    prompt,
    image_urls: [dataUri(photoBytes), ...referenceBytes.map(dataUri)],
    num_images: 1,
    output_format: 'png',
    ...modelOptions(options, photoSize),
  },
  { key, onStatus: (status) => console.log(`  ${status}`) },
);

// The model is in the default filename so two models can be run against one
// photo without the second silently overwriting the first — which is the whole
// point of --model. `openai/gpt-image-2/edit` and `fal-ai/nano-banana/edit`
// both reduce to their middle segment: the owner is noise and every one of
// these ends in /edit.
const modelSlug = options.model.split('/')[1] ?? options.model.replace(/\W+/g, '-');
const out = options.out ?? path.join(ROOT, `try-on-${style.id}-${modelSlug}.png`);
await writeFile(out, await fetchImageBytes(firstImage(result).url));
console.log(`wrote ${path.relative(ROOT, out)}`);
