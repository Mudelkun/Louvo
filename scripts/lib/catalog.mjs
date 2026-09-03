/**
 * Loads the hairstyle catalog for the generator.
 *
 * The catalog is data, not code (see CLAUDE.md), so this script must never carry
 * its own list of hairstyles. Today the data lives in `src/api/mockCatalog.ts`;
 * once the Railway API exists, set CATALOG_URL and the same script generates from
 * the live catalog with no other change.
 */

import { loadTsModule } from './transpile.mjs';

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
 * `mockCatalog.ts` is TypeScript whose only imports are type-only, so it is
 * imported as-is rather than copied. See `lib/transpile.mjs`.
 */
async function loadMockCatalog(root) {
  const mod = await loadTsModule({ root, file: 'src/api/mockCatalog.ts' });
  if (!mod.mockCatalog) throw new Error('src/api/mockCatalog.ts does not export mockCatalog');
  return mod.mockCatalog;
}
