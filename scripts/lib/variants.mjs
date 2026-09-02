/**
 * The hairstyle × hair type matrix, read by the generator.
 *
 * A deliberate mirror of `src/lib/hairTypes.ts`, not a shared module: the app's
 * copy is TypeScript behind the `@/` alias, and `lib/catalog.mjs` loads the
 * catalog by transpiling `mockCatalog.ts` on its own, so nothing under
 * `scripts/` can import from `src/`. Both copies read the same `variants` rows
 * out of the catalog, which is where the classification actually lives — keep
 * the two in step, and change neither of them to hold a judgement about a
 * hairstyle.
 */

/** Types 1 to 4, in the order they are resolved in. */
export const HAIR_TYPE_IDS = ['straight', 'wavy', 'curly', 'coily'];

/** Every variant directory a style may have. `any` = one render for all types. */
export const VARIANT_IDS = ['any', ...HAIR_TYPE_IDS];

/**
 * A catalog row's matrix, defaulting a row that has none to a single `any`
 * render. That default is for an older API response, not for a hairstyle
 * someone forgot to classify: `--matrix` names anything relying on it.
 */
export function matrixOf(style) {
  if (!style.variants) return Object.fromEntries(HAIR_TYPE_IDS.map((type) => [type, 'any']));
  return style.variants;
}

/** True when the row came out of the default above rather than the catalog. */
export const isUnclassified = (style) => !style.variants;

/**
 * Every distinct render this style needs, in resolution order — the generator's
 * work list for one hairstyle.
 */
export function variantsOf(style) {
  const matrix = matrixOf(style);
  const seen = [];
  for (const type of HAIR_TYPE_IDS) {
    const variant = matrix[type];
    if (variant && !seen.includes(variant)) seen.push(variant);
  }
  return seen;
}

/** Which hair types a given render stands in for. */
export function typesForVariant(style, variant) {
  const matrix = matrixOf(style);
  return HAIR_TYPE_IDS.filter((type) => matrix[type] === variant);
}

/** The hair types this style is not offered for at all. */
export function unsupportedTypes(style) {
  const matrix = matrixOf(style);
  return HAIR_TYPE_IDS.filter((type) => !matrix[type]);
}
