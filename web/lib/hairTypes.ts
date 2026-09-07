/**
 * The hairstyle x hair type matrix, read.
 *
 * A hand-written mirror of `src/lib/hairTypes.ts`, and a deliberate one — the
 * fourth copy of these predicates in the repository, alongside the app's, the
 * server's (`server/src/hairstyles.ts`) and the generator's
 * (`scripts/lib/variants.mjs`). The bargain is the one CLAUDE.md sets out: the
 * *judgement* — does this cut look different on coily hair — lives beside the
 * haircut, in the catalog's `variants` row, and nothing here may contain an
 * opinion about a hairstyle. All four copies only read that row.
 *
 * Copying it the way `hairShape.ts` is copied was considered and rejected: this
 * file has to compile against the *web's* types and the app's version imports
 * through `@/api/types`, which would drag the app's whole type module across the
 * boundary to re-point one union. A predicate is also the case where a mirror
 * genuinely works — two implementations of "is this cut offered for type 4" can
 * be compared by running them, which is exactly what a document cannot be.
 */

import type { HairTypeId, Hairstyle, TextureKind, VariantId } from './contract/catalog';

/** Types 1 to 4, in the order they are shown and resolved in. */
export const HAIR_TYPE_IDS: HairTypeId[] = ['straight', 'wavy', 'curly', 'coily'];

/** The sentinel the picker and the query layer use for "All Types". */
export const ALL_HAIR_TYPES = 'all';

/**
 * Reads a hair type off a URL search param, so a style page opened from a
 * filtered grid opens on the type the grid was showing.
 *
 * Three answers, not two: a type id, `null` for `ALL_HAIR_TYPES` — browsing with
 * nothing declared, which is an answer — and `undefined` when the param is
 * absent or unrecognised, which is the caller's cue to fall back to whatever it
 * would have used anyway.
 */
export function parseHairType(value: string | null | undefined): HairTypeId | null | undefined {
  if (!value) return undefined;
  if (value === ALL_HAIR_TYPES) return null;
  return HAIR_TYPE_IDS.includes(value as HairTypeId) ? (value as HairTypeId) : undefined;
}

/** Whether the style is offered for a type. "All Types" is offered everything. */
export function supportsHairType(
  style: Pick<Hairstyle, 'variants'>,
  hairType: HairTypeId | null | undefined,
): boolean {
  if (!hairType) return true;
  return style.variants[hairType] != null;
}

/**
 * Every distinct render this style needs, in resolution order — the set the
 * style page offers as a switch.
 */
export function variantsOf(style: Pick<Hairstyle, 'variants'>): VariantId[] {
  const seen: VariantId[] = [];
  for (const type of HAIR_TYPE_IDS) {
    const variant = style.variants[type];
    if (variant && !seen.includes(variant)) seen.push(variant);
  }
  return seen;
}

/** Which hair types a given render stands in for — how a variant is labelled. */
export function typesForVariant(
  style: Pick<Hairstyle, 'variants'>,
  variant: VariantId,
): HairTypeId[] {
  return HAIR_TYPE_IDS.filter((type) => style.variants[type] === variant);
}

/** The one render to lead with when no type has been declared. */
export function representativeVariant(style: Pick<Hairstyle, 'variants'>): VariantId | null {
  return variantsOf(style)[0] ?? null;
}

/** The render to show this user, or null when the cut is not offered for them. */
export function variantFor(
  style: Pick<Hairstyle, 'variants'>,
  hairType: HairTypeId | null | undefined,
): VariantId | null {
  if (!hairType) return representativeVariant(style);
  return style.variants[hairType] ?? null;
}

/**
 * The renders to try, best first.
 *
 * With a type declared there is exactly one honest answer: showing a curly
 * render to somebody who said their hair is straight is a wrong image, not a
 * partial one, so an ungenerated variant falls through to the drawing the same
 * way an ungenerated style always has.
 *
 * Under "All Types" nothing has been declared, so there is nothing to be wrong
 * about: the representative render leads and any other variant of the same cut
 * is a fair stand-in behind it. That is also what keeps a half-generated
 * catalog — today, almost everything shot curly — browsable.
 */
export function variantCandidates(
  style: Pick<Hairstyle, 'variants'>,
  hairType: HairTypeId | null | undefined,
): VariantId[] {
  if (hairType) {
    const variant = style.variants[hairType];
    return variant ? [variant] : [];
  }
  return variantsOf(style);
}

/**
 * The texture the procedural fallback drawing should use.
 *
 * A style whose variant for this type is `any` keeps its own texture — the cut
 * is what it is regardless of what the hair does, which is exactly what `any`
 * means. Everything else is drawn in the user's own texture, so browsing as
 * Straight looks like a deliberate view of the catalog rather than a broken one
 * while its renders are still being generated.
 */
export function textureFor(
  style: Pick<Hairstyle, 'variants' | 'shape'>,
  hairType: HairTypeId | null | undefined,
): TextureKind {
  if (!hairType) return style.shape.texture;
  const variant = style.variants[hairType];
  if (!variant || variant === 'any') return style.shape.texture;
  return hairType;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type SortId = 'popular' | 'az' | 'upkeep';

export const SORTS: { id: SortId; label: string }[] = [
  { id: 'popular', label: 'Most wanted' },
  { id: 'az', label: 'A to Z' },
  { id: 'upkeep', label: 'Easiest upkeep' },
];

const UPKEEP_ORDER: Record<Hairstyle['maintenance'], number> = { Low: 0, Medium: 1, High: 2 };

const COMPARE: Record<SortId, (a: Hairstyle, b: Hairstyle) => number> = {
  popular: (a, b) => b.popularity - a.popularity,
  az: (a, b) => a.name.localeCompare(b.name),
  upkeep: (a, b) => UPKEEP_ORDER[a.maintenance] - UPKEEP_ORDER[b.maintenance] || b.popularity - a.popularity,
};

export interface CatalogQuery {
  gender?: Hairstyle['genders'][number] | null;
  hairType?: HairTypeId | null;
  categoryId?: string | null;
  sort?: SortId | null;
  search?: string | null;
  tag?: string | null;
}

/**
 * Filtering, in the browser, over the catalog already in memory.
 *
 * `GET /v1/hairstyles` does exactly this server-side and the web does not call
 * it, because the whole catalog is one ~45 KB gzipped document that has already
 * arrived. Filtering it locally is instant and works while the connection is
 * gone; a round trip per keystroke would be neither. The server's copy still
 * matters — it is what a client that only wants names and ids uses — so this is
 * a third reader of the same rules rather than a replacement for one.
 */
export function filterHairstyles(source: Hairstyle[], query: CatalogQuery): Hairstyle[] {
  const { gender, hairType, categoryId, sort, search, tag } = query;
  const needle = search?.trim().toLowerCase() ?? '';

  return source
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    .filter((style) => supportsHairType(style, hairType))
    .filter((style) => (categoryId && categoryId !== 'all' ? style.categoryIds.includes(categoryId) : true))
    .filter((style) => (tag ? style.tags.includes(tag) : true))
    .filter((style) => {
      if (!needle) return true;
      return (
        style.name.toLowerCase().includes(needle) ||
        style.tags.some((entry) => entry.toLowerCase().includes(needle)) ||
        style.description.toLowerCase().includes(needle)
      );
    })
    .sort(COMPARE[sort ?? 'popular']);
}

/** "You might also like" — nearest neighbours by shared category and tag. */
export function relatedTo(
  source: Hairstyle[],
  styleId: string,
  gender: Hairstyle['genders'][number] | null,
  hairType: HairTypeId | null,
  limit = 4,
): Hairstyle[] {
  const seed = source.find((style) => style.id === styleId);
  if (!seed) return source.slice(0, limit);

  return source
    .filter((style) => style.id !== styleId)
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    .filter((style) => supportsHairType(style, hairType))
    .map((style) => ({
      style,
      score:
        style.categoryIds.filter((id) => seed.categoryIds.includes(id)).length * 10 +
        style.tags.filter((tag) => seed.tags.includes(tag)).length * 4 +
        style.popularity / 100,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.style);
}
