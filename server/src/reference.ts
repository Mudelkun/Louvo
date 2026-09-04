/**
 * Which mannequin render a preview is shown, resolved server-side.
 *
 * A deliberate mirror of `variantCandidates()` in `src/lib/hairTypes.ts` and
 * `mannequinViews()` in `src/lib/mannequinRender.ts`, for the same reason
 * `hairstyles.ts` mirrors the app's filtering: the app and the server are
 * separate programs and neither may import the other. `check-previews.mjs` is
 * what keeps the two honest.
 *
 * Moving this to the server is most of what makes the preview backend cheap. The
 * app used to read a bundled PNG off the device and base64 it into the request —
 * roughly 550 KB of text up a phone's uplink on every single preview, for an
 * image that is byte-identical for every user who taps that card. Here the
 * reference is already a public CDN url in the catalog this process serves, so
 * the request carries the url and fal fetches the bytes itself.
 */

import type { CatalogResponse, Gender, HairLengthId, HairTypeId, Hairstyle, VariantId, ViewAngle } from './types.js';
import { ANCHOR_LENGTH, HAIR_TYPE_IDS, VIEW_ANGLES } from './types.js';

/**
 * The one angle that gets sent, and the reason it is one.
 *
 * Mirrors `REFERENCE_VIEWS` in `src/api/tryOn.ts`, where the measurement behind
 * it is written up at length. The short version: with five images in the request
 * the model stops treating the photograph as the thing being edited and starts
 * composing across the set, and what comes back is a studio portrait of a
 * stranger on the mannequin's grey ground. The request has to read as *here is a
 * picture, here is a haircut, put the second on the first*, which is two images.
 *
 * Do not solve a missing view by adding images back. That is the one thing here
 * that has been measured and is known to fail.
 */
export const REFERENCE_VIEWS: ViewAngle[] = ['half'];

/** Every distinct render this style needs, in resolution order. */
function variantsOf(style: Pick<Hairstyle, 'variants'>): VariantId[] {
  const seen: VariantId[] = [];
  for (const type of HAIR_TYPE_IDS) {
    const variant = style.variants[type];
    if (variant && !seen.includes(variant)) seen.push(variant);
  }
  return seen;
}

/**
 * The renders to try, best first — strict when a type has been declared.
 *
 * Mirrors `variantCandidates()`. A declared hair type matches its variant
 * exactly or not at all, because on screen the curly render of a cut somebody
 * asked to see straight is a wrong image rather than a partial one.
 */
export function variantCandidates(
  style: Pick<Hairstyle, 'variants'>,
  hairType: HairTypeId | null,
): VariantId[] {
  if (hairType) {
    const variant = style.variants[hairType];
    return variant ? [variant] : [];
  }
  return variantsOf(style);
}

export interface Reference {
  variant: VariantId;
  length: HairLengthId;
  views: { angle: ViewAngle; url: string }[];
}

/**
 * Every angle of one variant of one cut, from the catalog's render manifest.
 *
 * The variant and the length are each resolved *once* and every view then comes
 * from that resolution, for the reason `mannequinViews()` gives: a curly front
 * and a coily back are two haircuts handed to a model that was asked for one.
 */
function viewsFor(
  catalog: CatalogResponse,
  styleId: string,
  gender: Gender,
  candidates: VariantId[] | null,
  length: HairLengthId,
): Reference | null {
  const byVariant = catalog.renders[styleId];
  if (!byVariant) return null;

  const wanted = candidates ?? (Object.keys(byVariant) as VariantId[]);
  // Length falls back to the anchor where hair type does not — see the note in
  // `mannequinRender.ts`. A length is asked for in a control the user is
  // holding; a hair type is declared.
  const lengths: HairLengthId[] = length === ANCHOR_LENGTH ? [length] : [length, ANCHOR_LENGTH];

  for (const variant of wanted) {
    const byLength = byVariant[variant];
    if (!byLength) continue;
    for (const entry of lengths) {
      const byGender = byLength[entry];
      const byAngle = byGender?.[gender];
      if (!byAngle) continue;
      const views = VIEW_ANGLES.flatMap((angle) => {
        const url = byAngle[angle]?.url;
        return url ? [{ angle, url }] : [];
      });
      if (views.length) return { variant, length: entry, views };
    }
  }
  return null;
}

/**
 * The reference for a preview: the right variant, or any variant of the same
 * cut, or nothing.
 *
 * The fallback to "any variant" is the one place this diverges from what the app
 * puts on screen, and it is deliberate — `resolveReference()` in
 * `src/api/tryOn.ts` carries the full argument. In short: the catalog was shot
 * curly and is part-way through coily, so 44 of the 99 male style x hair-type
 * combinations have no render for the declared type, and every one of those
 * previews was degrading silently to a name-only prompt — which, against four
 * paragraphs of "keep the photograph exactly the same", reliably returns the
 * photograph exactly the same. The user asks for a mid fade and nothing happens.
 *
 * The reference is not on screen and is not doing the same job: it supplies
 * *geometry*, which is the part of a cut that survives a change of texture, and
 * the texture is supplied separately in words by `hairTypeLine`. When the two
 * disagree the prompt says so outright.
 */
export function resolveReference(
  catalog: CatalogResponse,
  hairstyle: Hairstyle,
  gender: Gender,
  hairType: HairTypeId | null,
  length: HairLengthId = ANCHOR_LENGTH,
): Reference | null {
  return (
    viewsFor(catalog, hairstyle.id, gender, variantCandidates(hairstyle, hairType), length) ??
    viewsFor(catalog, hairstyle.id, gender, null, length)
  );
}

/** The reference trimmed to the angles a request should actually carry. */
export function referenceViews(reference: Reference | null): { angle: ViewAngle; url: string }[] {
  return (reference?.views ?? []).filter((view) => REFERENCE_VIEWS.includes(view.angle));
}
