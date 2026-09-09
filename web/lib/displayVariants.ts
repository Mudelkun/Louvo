/**
 * Which render to *show* when the declared texture has never been shot.
 *
 * `variantCandidates()` is strict on purpose and stays strict: a hair type is
 * declared, so a curly render shown to somebody who said coily is a wrong image
 * rather than a partial one, and the honest answer has always been to fall
 * through to the procedural drawing in `<Plate>`. That rule was written for the
 * *app*, where the drawing is a plausible stand-in on a phone that has just been
 * installed and the catalogue is still arriving.
 *
 * On the website it reaches a different conclusion, for one reason: the drawing
 * is a flat cartoon head sitting in a grid of studio renders. It does not read
 * as "this texture has not been shot yet" — it reads as a broken card, or as a
 * developer placeholder somebody forgot to remove, and it is the only thing on
 * the page that looks unfinished. A visitor four seconds into a shopfront draws
 * a conclusion about the product, not about the generator's backlog.
 *
 * So the site substitutes: when nothing has been shot for the declared texture,
 * it shows a real photograph of *the same haircut* in a texture that has, and
 * says which one. That is a weaker claim than the strict rule makes and it is
 * made out loud — `<StyleCard>` captions the plate with the textures the render
 * actually stands for, exactly as it does mid-cycle — so nobody is told they are
 * looking at their own texture when they are not.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not widen what the catalogue offers.** A cut that is not offered
 *   for a texture at all is filtered out one level up (`supportsHairType`) and
 *   never reaches here. This only ever substitutes a *picture*, never an answer
 *   to "is this cut available for my hair".
 * - **It does not cycle.** Under *All Types* a card cross-fades through every
 *   texture a cut was shot in, because nothing has been declared and the whole
 *   matrix is the point. With a texture declared, the substitute is one render
 *   and it stays still: a picture that is already standing in for something must
 *   not also be a slideshow.
 *
 * A cut with no imagery whatsoever still falls through to the drawing, which is
 * the one case where there is nothing better to show and the "Illustrated" badge
 * says so.
 */

import type { Hairstyle, HairTypeId, RenderManifest, VariantId } from './contract/catalog';
import { variantCandidates, variantsOf } from './hairTypes';
import { ANCHOR_LENGTH, HERO_ANGLE, resolveRender, type RenderQuery } from './renders';

export interface DisplayVariants {
  /** The variants to resolve against, best first — hand straight to `renders.ts`. */
  variants: VariantId[];
  /** True when these are a stand-in for a declared texture that was never shot. */
  substituted: boolean;
}

/**
 * The variant list a plate should draw, given what the visitor declared.
 *
 * Existence is tested at the angle and length the caller is actually going to
 * draw, because "shot" is not a property of a cut — it is a property of a cut at
 * a gender, an angle and a length, and a substitute chosen against the hero
 * would be a hole again the moment somebody swiped to the back of the head.
 */
export function displayVariants(
  manifest: RenderManifest,
  style: Pick<Hairstyle, 'id' | 'variants'>,
  hairType: HairTypeId | null | undefined,
  query: Pick<RenderQuery, 'gender' | 'angle' | 'length'> = {},
): DisplayVariants {
  const candidates = variantCandidates(style, hairType);
  if (!hairType) return { variants: candidates, substituted: false };

  const { gender = null, angle = HERO_ANGLE, length = ANCHOR_LENGTH } = query;
  const shot = (variant: VariantId) =>
    !!resolveRender(manifest, { styleId: style.id, gender, angle, variants: [variant], length });

  if (candidates.some(shot)) return { variants: candidates, substituted: false };

  const stand = variantsOf(style).find(shot);
  return stand ? { variants: [stand], substituted: true } : { variants: candidates, substituted: false };
}
