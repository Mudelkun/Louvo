/**
 * Reading the catalog: filtering, ordering, recommendations.
 *
 * These run over the in-memory catalog rather than as SQL, and that is a
 * decision rather than a shortcut. The interesting predicate is
 * `supportsHairType` — "is this cut offered for type 4 at all" — which is a read
 * of the hairstyle x hair type matrix, and the matrix is the thing the whole
 * catalog is organised around. Expressing it once, in the same terms the app
 * uses, is worth more than a query plan on a few thousand rows that are already
 * resident in this process.
 *
 * The app keeps its own copy of these predicates (`filterHairstyles` in
 * `src/api/client.ts`) so a cached catalog can be re-filtered without a round
 * trip. That is a third mirror, and it is the same bargain as the other two:
 * both sides must agree, neither may import the other.
 */

import type { Gender, HairTypeId, Hairstyle, VariantId } from './types.js';

export type SortId = 'popular' | 'az' | 'upkeep';

export const SORT_IDS: SortId[] = ['popular', 'az', 'upkeep'];

export interface HairstyleQuery {
  gender?: Gender | null;
  /** `null` is "All Types" and filters nothing. */
  hairType?: HairTypeId | null;
  categoryId?: string | null;
  sort?: SortId | null;
  search?: string | null;
  tag?: string | null;
  limit?: number | null;
}

const UPKEEP_ORDER: Record<Hairstyle['maintenance'], number> = { Low: 0, Medium: 1, High: 2 };

const SORTS: Record<SortId, (a: Hairstyle, b: Hairstyle) => number> = {
  popular: (a, b) => b.popularity - a.popularity,
  az: (a, b) => a.name.localeCompare(b.name),
  upkeep: (a, b) =>
    UPKEEP_ORDER[a.maintenance] - UPKEEP_ORDER[b.maintenance] || b.popularity - a.popularity,
};

/**
 * Whether a style is offered for a hair type.
 *
 * A style with no variant for a type is not a thinner version of itself, it is a
 * different head of hair, so it is removed rather than shown with the wrong
 * render. "All Types" declares nothing and is therefore offered everything.
 */
export function supportsHairType(style: Pick<Hairstyle, 'variants'>, hairType: HairTypeId | null | undefined): boolean {
  if (!hairType) return true;
  return style.variants[hairType] != null;
}

/** Every distinct render a style needs, in resolution order. */
export function variantsOf(style: Pick<Hairstyle, 'variants'>): VariantId[] {
  const seen: VariantId[] = [];
  for (const type of ['straight', 'wavy', 'curly', 'coily'] as HairTypeId[]) {
    const variant = style.variants[type];
    if (variant && !seen.includes(variant)) seen.push(variant);
  }
  return seen;
}

export function filterHairstyles(source: Hairstyle[], query: HairstyleQuery): Hairstyle[] {
  const { gender, hairType, categoryId, sort, search, tag, limit } = query;
  const needle = search?.trim().toLowerCase() ?? '';

  const result = source
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    .filter((style) => supportsHairType(style, hairType))
    .filter((style) => (categoryId && categoryId !== 'all' ? style.categoryIds.includes(categoryId) : true))
    .filter((style) => (tag ? style.tags.includes(tag) : true))
    .filter((style) => {
      if (!needle) return true;
      return (
        style.name.toLowerCase().includes(needle) ||
        style.tags.some((t) => t.toLowerCase().includes(needle)) ||
        style.description.toLowerCase().includes(needle)
      );
    })
    .sort(SORTS[sort ?? 'popular']);

  return typeof limit === 'number' ? result.slice(0, limit) : result;
}

/** "More styles for you" — nearest neighbours by shared category and tag. */
export function recommendationsFor(
  source: Hairstyle[],
  styleId: string,
  gender: Gender | null,
  limit = 6,
  hairType: HairTypeId | null = null,
): Hairstyle[] {
  const seed = source.find((style) => style.id === styleId);
  if (!seed) return source.slice(0, limit);

  return source
    .filter((style) => style.id !== styleId)
    .filter((style) => (gender ? style.genders.includes(gender) : true))
    .filter((style) => supportsHairType(style, hairType))
    .map((style) => {
      const shared = style.categoryIds.filter((c) => seed.categoryIds.includes(c)).length;
      const sharedTags = style.tags.filter((t) => seed.tags.includes(t)).length;
      return { style, score: shared * 10 + sharedTags * 4 + style.popularity / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.style);
}
