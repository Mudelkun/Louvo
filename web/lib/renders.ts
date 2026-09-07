/**
 * Finding the right render, and its mask, in the catalog's manifest.
 *
 * A mirror of `src/lib/mannequinRender.ts` with one whole branch removed: the
 * app resolves against *two* indexes of the same shape — the catalog's, and a
 * bundled `require()` map that keeps a fresh checkout runnable with no server —
 * and the web has only the first. There is nothing to fall back to, and that is
 * correct rather than a gap: a website with no API is a website that is down,
 * where an app with no API is an app somebody just installed.
 *
 * What is kept exactly is the resolution order, because it encodes two rules
 * that took the app a while to get right:
 *
 * - **Only an exact angle matches.** A fade shot from the side is not an honest
 *   stand-in for the same fade from behind.
 * - **Length falls back to the anchor; hair type does not.** A hair type is
 *   *declared*, so the wrong texture is a wrong image and drops to the drawing.
 *   A length is *asked for*, in a control the user is holding, on a cut whose
 *   anchor render they were already looking at — dropping to a line drawing
 *   mid-drag is a worse answer than showing the cut at its usual length. The
 *   page then says which it got, which is what `resolveRender` returns the
 *   resolved length for.
 */

import type {
  Gender,
  HairLengthId,
  RenderManifest,
  RenderRef,
  VariantId,
  ViewAngle,
} from './contract/catalog';

/** The cut as the catalog shot it — see `ANCHOR_LENGTH` in the contract. */
export const ANCHOR_LENGTH: HairLengthId = 'medium';

/**
 * The one view that stands for a style wherever only one image fits.
 *
 * The three-quarter turn, because a haircut reads from it: the fringe, the
 * taper above the ear and a little of the nape are all in frame at once, where
 * dead-on hides the sides and the profile hides the front.
 */
export const HERO_ANGLE: ViewAngle = 'half';

export const VIEW_ANGLES: ViewAngle[] = ['front', 'half', 'side', 'back'];

export const ANGLE_LABELS: Record<ViewAngle, string> = {
  front: 'Front',
  half: 'Three-quarter',
  side: 'Profile',
  back: 'Back',
};

/** When the caller does not know the gender, whichever exists — male first. */
const GENDER_ORDER: Gender[] = ['male', 'female'];

export interface ResolvedRender {
  ref: RenderRef;
  variant: VariantId;
  /** The length actually landed on: the one asked for, or the anchor. */
  length: HairLengthId;
  gender: Gender;
  angle: ViewAngle;
}

const lengthOrder = (length: HairLengthId): HairLengthId[] =>
  length === ANCHOR_LENGTH ? [length] : [length, ANCHOR_LENGTH];

export interface RenderQuery {
  styleId: string | null | undefined;
  gender?: Gender | null;
  angle?: ViewAngle;
  /** Ordered, best first — see `variantCandidates()`. Null accepts any. */
  variants?: VariantId[] | null;
  length?: HairLengthId;
}

/**
 * The best render for a query, or null when nothing has been generated for it.
 *
 * Null is the normal state for most of the catalog right now, not an error: the
 * generator has finished men x curly and little else, so a women's render or a
 * coily one usually does not exist. Every caller draws the procedural mannequin
 * instead, which is why this returns null rather than a placeholder.
 */
export function resolveRender(manifest: RenderManifest, query: RenderQuery): ResolvedRender | null {
  const { styleId, gender = null, angle = HERO_ANGLE, variants = null, length = ANCHOR_LENGTH } = query;
  const byVariant = styleId ? manifest[styleId] : undefined;
  if (!byVariant) return null;

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  for (const variant of wanted) {
    const byLength = byVariant[variant];
    if (!byLength) continue;
    for (const entry of lengthOrder(length)) {
      const byGender = byLength[entry];
      if (!byGender) continue;
      const genders = gender ? [gender] : GENDER_ORDER;
      for (const candidate of genders) {
        const ref = byGender[candidate]?.[angle];
        if (ref?.url) return { ref, variant, length: entry, gender: candidate, angle };
      }
    }
  }
  return null;
}

/**
 * Every angle that exists for the variant a hero lookup landed on.
 *
 * Taken from *one* variant rather than assembled across several: a curly front
 * and a coily back would be two haircuts presented as four views of one, the
 * same failure the try-on avoids a level up by taking its reference from a
 * single variant.
 */
export function resolveViews(manifest: RenderManifest, query: RenderQuery): ResolvedRender[] {
  const hero = resolveRender(manifest, query);
  if (!hero) return [];
  return VIEW_ANGLES.map((angle) =>
    resolveRender(manifest, {
      ...query,
      angle,
      variants: [hero.variant],
      length: hero.length,
      gender: hero.gender,
    }),
  ).filter((entry): entry is ResolvedRender => !!entry);
}

/**
 * The distinct renders a card may cycle through, deduped by url.
 *
 * Deduped rather than merely listed, because two candidates resolving to one
 * file read as a stutter rather than as a second version of the cut — which is
 * the bug `renderedVariants()` exists to prevent in the app's grid. A style with
 * one render comes back with one entry and its card stays still.
 */
export function renderedVariants(
  manifest: RenderManifest,
  query: RenderQuery & { variants: VariantId[] },
): ResolvedRender[] {
  const seen = new Set<string>();
  const found: ResolvedRender[] = [];
  for (const variant of query.variants) {
    const resolved = resolveRender(manifest, { ...query, variants: [variant] });
    if (!resolved || seen.has(resolved.ref.url)) continue;
    seen.add(resolved.ref.url);
    found.push(resolved);
  }
  return found;
}

/** Whether the catalog has any imagery at all for a style. */
export const hasRender = (manifest: RenderManifest, styleId: string): boolean => !!manifest[styleId];
