#!/usr/bin/env node
/**
 * Copies the modules the web app must agree with byte for byte.
 *
 *   node scripts/sync-contract.mjs           write web/lib/contract/
 *   node scripts/sync-contract.mjs --check   fail if they are out of date
 *
 * ## Why a copy and not a mirror
 *
 * This repository already crosses the app/server boundary three times, and it
 * does it two different ways on purpose. A *predicate* — "is this cut offered
 * for type 4" — is mirrored by hand and kept honest by running both copies
 * against the same input (`scripts/lib/variants.mjs` against
 * `src/lib/hairTypes.ts`). A *document* cannot be: two copies of a privacy
 * policy that have drifted apart are two different promises about somebody's
 * photograph, and no test can say which was meant.
 * `server/scripts/sync-shared.mjs` is that argument written down.
 *
 * The web is a fourth program on the same boundary, and it needs one of each:
 *
 * - **`catalog.ts`** is the wire shape of `GET /v1/catalog`. It is not prose,
 *   but it is not a predicate either — it is a *contract*, and a hand-typed
 *   fourth copy of it is a field that silently stops arriving.
 *   `Hairstyle.variants` coming back empty removes a cut from every hair type on
 *   every device, which is precisely the failure `check-roundtrip.mjs` exists to
 *   catch server-side.
 * - **`legal.ts`** is the Privacy Policy and the Terms of Use, for the reason
 *   above, one step further along: the web serves the same words at
 *   `/legal/privacy`, and two copies of a privacy policy are two promises.
 * - **`hairShape.ts`** is the geometry of the procedural mannequin — pure
 *   arithmetic returning SVG path data. It is copied rather than mirrored
 *   because there is nothing in it to have an opinion about: a second
 *   implementation of the same ellipse would be a second silhouette for the same
 *   haircut, which is exactly what the fallback exists to avoid.
 *
 * **Edit the source. Never edit the output.** `--check` runs in `prebuild` and
 * in `typecheck`, so a stale copy fails the build rather than shipping.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');
const OUT_DIR = path.join(WEB_ROOT, 'lib', 'contract');

/** `[source from the repo root, output basename]`. */
const SOURCES = [
  ['server/src/types.ts', 'catalog.ts'],
  ['src/lib/legal.ts', 'legal.ts'],
  ['src/lib/hairShape.ts', 'hairShape.ts'],
];

/**
 * The one transform, and the same one `server/scripts/sync-shared.mjs` performs.
 *
 * A **type-only** import through the app's `@/` alias is re-pointed at
 * `./extras`, which re-exports the wire contract and adds the short list of
 * app-side types the server has no opinion about. A **value** import is a hard
 * error rather than a guess: there is nothing this script could honestly
 * re-point one to, and emitting something that does not compile is worse than
 * refusing to emit anything.
 */
const TYPE_IMPORT = /^import type \{([^}]*)\} from '@\/[^']*';$/;
const VALUE_IMPORT = /^import (?!type )/;

const NEWLINE = '\n';

function header(relative) {
  return [
    '/**',
    ' * GENERATED FILE — DO NOT EDIT.',
    ' *',
    ` * Copied from \`${relative}\` by \`web/scripts/sync-contract.mjs\`, with only`,
    ' * its import header re-pointed. Edit the source and re-run `npm run sync`.',
    ' */',
    '',
    '',
  ].join(NEWLINE);
}

/** One source module as the web should see it. */
function transpose(relative, source) {
  const named = new Set();
  const body = [];

  for (const line of source.split(NEWLINE)) {
    const typeImport = TYPE_IMPORT.exec(line.trim());
    if (typeImport) {
      for (const name of typeImport[1].split(',')) {
        const trimmed = name.trim();
        if (trimmed) named.add(trimmed);
      }
      continue;
    }
    if (VALUE_IMPORT.test(line.trim())) {
      throw new Error(
        `${relative} has a value import (${line.trim()}). Only type-only imports can be ` +
          're-pointed at the contract — either keep the module import-free, or mirror it by ' +
          'hand and remove it from SOURCES.',
      );
    }
    body.push(line);
  }

  const imports = named.size
    ? `import type { ${[...named].sort().join(', ')} } from './extras';${NEWLINE}${NEWLINE}`
    : '';

  // The leading blank lines a stripped import header leaves behind would
  // otherwise drift by one every time an import is added or removed, which
  // would make `--check` fail on a file nobody edited.
  return header(relative) + imports + body.join(NEWLINE).replace(/^\n+/, '');
}

async function build() {
  const files = [];
  for (const [relative, basename] of SOURCES) {
    const source = await readFile(path.join(REPO_ROOT, relative), 'utf8');
    files.push([basename, transpose(relative, source)]);
  }
  return files;
}

const check = process.argv.includes('--check');

try {
  const files = await build();
  if (check) {
    const stale = [];
    for (const [basename, contents] of files) {
      const existing = await readFile(path.join(OUT_DIR, basename), 'utf8').catch(() => null);
      if (existing !== contents) stale.push(basename);
    }
    if (stale.length) {
      console.error(
        `web/lib/contract/ is out of date (${stale.join(', ')}). Run: npm run sync --prefix web`,
      );
      process.exit(1);
    }
    console.log('web/lib/contract/ is up to date');
  } else {
    await mkdir(OUT_DIR, { recursive: true });
    for (const [basename, contents] of files) {
      await writeFile(path.join(OUT_DIR, basename), contents);
    }
    console.log(`web/lib/contract/ — ${files.map(([name]) => name).join(', ')}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
