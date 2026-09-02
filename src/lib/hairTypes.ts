/**
 * The hairstyle x hair type matrix, read.
 *
 * The matrix itself is catalog data — one `variants` row per hairstyle (see
 * `HairTypeVariants` in `src/api/types.ts`). Nothing here decides whether a cut
 * needs its own curly shot; it only answers the questions the app asks of that
 * decision: is this style offered for my type, which render should I be shown,
 * and which renders does the generator still owe us.
 *
 * The whole point of the indirection is that hairstyle count x hair type is not
 * hairstyle count times four. A cut whose wavy version is indistinguishable from
 * its straight one points both types at one render, and a cut short enough,
 * set enough or constructed enough that natural texture never reads points all
 * four at `any`.
 */

import type { HairTypeId, Hairstyle, TextureKind, VariantId } from '@/api/types';

/** Types 1 to 4, in the order they are shown and resolved in. */
export const HAIR_TYPE_IDS: HairTypeId[] = ['straight', 'wavy', 'curly', 'coily'];

/** The sentinel the picker and the query layer use for "All Types". */
export const ALL_HAIR_TYPES = 'all';

/**
 * Reads a hair type carried on a navigation param, so a screen opened from a
 * filtered grid can open on the same type the grid was showing.
 *
 * Three answers, not two: a type id, `null` for `ALL_HAIR_TYPES` — browsing
 * with no type declared, which is an answer — and `undefined` when the param is
 * absent or unrecognised, which is the caller's cue to fall back to whatever it
 * would have used before (usually the session's own type).
 */
export function parseHairType(
  value: string | string[] | undefined,
): HairTypeId | null | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  if (raw === ALL_HAIR_TYPES) return null;
  return HAIR_TYPE_IDS.includes(raw as HairTypeId) ? (raw as HairTypeId) : undefined;
}

/**
 * The render to show this user, or null when the style is not offered for their
 * type at all.
 */
export function variantFor(
  style: Pick<Hairstyle, 'variants'>,
  hairType: HairTypeId | null | undefined,
): VariantId | null {
  if (!hairType) return representativeVariant(style);
  return style.variants[hairType] ?? null;
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
 * Every distinct render this style needs, in resolution order — the generator's
 * work list for one hairstyle, and the set the detail screen offers as a switch.
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

/**
 * The renders to try, best first.
 *
 * With a type declared there is exactly one honest answer: showing a curly
 * render to someone who said their hair is straight is a wrong image, not a
 * partial one, so an ungenerated variant falls through to the procedural
 * drawing the same way an ungenerated style always has.
 *
 * Under "All Types" nothing has been declared, so there is nothing to be wrong
 * about: the representative render leads and any other variant of the same cut
 * is a fair stand-in behind it. That is also what keeps a half-generated
 * catalog — today, every render shot curly — browsable.
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
 * Straight looks like a deliberate view of the catalog rather than a broken
 * one while its renders are still being generated.
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
