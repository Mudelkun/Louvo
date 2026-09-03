/**
 * Imports a TypeScript module out of `src/` from a plain node script.
 *
 * Nothing under `scripts/` may import from `src/` as a *dependency* — the
 * generator and the app are separate programs, which is why
 * `scripts/lib/variants.mjs` and `src/lib/hairTypes.ts` are deliberate mirrors
 * of each other. This is the narrow exception that has always existed for
 * `mockCatalog.ts`: a module whose only imports are type-only strips down to
 * runnable JavaScript, so it can be *the same file* rather than a copy.
 *
 * Use it only for files that qualify, and prefer it when they do. A prompt is
 * the clearest case: an app-side prompt and a script-side copy of it that drift
 * apart are two different haircuts, and the script exists precisely to test what
 * the app will send.
 *
 * The temp file is written beside the source so any relative import that appears
 * later still resolves, and removed whatever happens.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {{ root: string, file: string }} opts  `file` is relative to the repo root
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadTsModule({ root, file }) {
  const source = path.join(root, file);
  const directory = path.dirname(source);
  const temp = path.join(directory, `.${path.basename(file, '.ts')}.${process.pid}.mjs`);

  const ts = (await import('typescript')).default;
  const code = await readFile(source, 'utf8');
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
    fileName: source,
  });

  try {
    await writeFile(temp, outputText, 'utf8');
    return await import(pathToFileURL(temp).href);
  } finally {
    await rm(temp, { force: true });
  }
}
