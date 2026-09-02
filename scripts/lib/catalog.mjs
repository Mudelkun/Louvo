/**
 * Loads the hairstyle catalog for the generator.
 *
 * The catalog is data, not code (see CLAUDE.md), so this script must never carry
 * its own list of hairstyles. Today the data lives in `src/api/mockCatalog.ts`;
 * once the Railway API exists, set CATALOG_URL and the same script generates from
 * the live catalog with no other change.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {{ root: string, catalogUrl?: string|null }} opts
 * @returns {Promise<import('../../src/api/types').Catalog>}
 */
export async function loadCatalog({ root, catalogUrl }) {
  if (catalogUrl) {
    const res = await fetch(catalogUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET ${catalogUrl} -> ${res.status} ${res.statusText}`);
    return res.json();
  }
  return loadMockCatalog(root);
}

/**
 * `mockCatalog.ts` is TypeScript whose only imports are type-only, so stripping
 * the types with the compiler already in devDependencies yields an importable
 * module. The temp file is written beside the source so any relative import that
 * appears later still resolves.
 */
async function loadMockCatalog(root) {
  const source = path.join(root, 'src', 'api', 'mockCatalog.ts');
  const temp = path.join(root, 'src', 'api', `.mockCatalog.${process.pid}.mjs`);

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
    const mod = await import(pathToFileURL(temp).href);
    if (!mod.mockCatalog) throw new Error(`${source} does not export mockCatalog`);
    return mod.mockCatalog;
  } finally {
    await rm(temp, { force: true });
  }
}
