import {
  maskIndex,
  renderIndex,
  sameSource,
  type RenderIndex,
  type RenderSource,
  type RenderVariantMap,
} from '@/api/renderIndex';
import type { Gender, HairLengthId, VariantId } from '@/api/types';
import { ANCHOR_LENGTH } from '@/lib/hairLengths';
import { VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';

/**
 * The AI-generated mannequin render for a style, if one has been generated.
 *
 * The renders themselves come from whichever index is active — the catalog's,
 * installed from the API, or the bundled one as a fallback (see
 * `src/api/renderIndex.ts`). Nothing here knows which: a bundled asset handle
 * and a CDN url are both `RenderSource`, and every consumer of one already
 * accepts the other. Styles with no render fall back to the procedural drawing
 * in `<Mannequin>`, which is why every lookup returns `null` rather than a
 * placeholder — and that is now also what an unreachable CDN looks like.
 *
 * Only an exact angle match is used: a fade shot from the side is not an honest
 * stand-in for the same fade from behind. Gender is matched exactly too when the
 * caller knows it; when it does not (the catalog before the user has chosen),
 * whichever exists is shown, male first.
 *
 * `variants` is the same idea one level up, and it is an ordered list rather
 * than a single id because how strict the match has to be depends on what the
 * user has told us. `variantCandidates()` in `src/lib/hairTypes.ts` builds it:
 * one entry once a hair type is declared, several under "All Types". Passing
 * nothing accepts any variant, which is what the callers with no hairstyle
 * behind them — the sample photo, the welcome screen — actually mean.
 */
const GENDER_ORDER: Gender[] = ['male', 'female'];

/**
 * The lengths to try for a request, best first.
 *
 * Length falls back to the anchor where the hair type does not, and the
 * difference is not an inconsistency — it is the same rule applied to two things
 * that mean different things. A hair type is *declared*: the user has said their
 * hair is coily, so a curly render is a wrong image and falls through to the
 * drawing. A length is *asked for*, in a control the user is holding, on a cut
 * whose anchor render they were already looking at. Dropping to a line drawing
 * mid-drag would be a worse answer than showing the cut at its usual length, and
 * the style screen says which it got — `renderLength()` is how it knows.
 *
 * The anchor is never tried twice, so a request for it is a single lookup.
 */
const lengthOrder = (length: HairLengthId, exact: boolean): HairLengthId[] =>
  exact || length === ANCHOR_LENGTH ? [length] : [length, ANCHOR_LENGTH];

function lookup(
  map: RenderIndex,
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants: VariantId[] | null | undefined,
  length: HairLengthId = ANCHOR_LENGTH,
  exact = false,
): { variant: VariantId; length: HairLengthId; source: RenderSource } | null {
  const byVariant = styleId ? map[styleId] : undefined;
  if (!byVariant) return null;

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  for (const variant of wanted) {
    const byLength = byVariant[variant];
    if (!byLength) continue;
    for (const entry of lengthOrder(length, exact)) {
      const byGender = byLength[entry];
      if (!byGender) continue;
      const views = gender ? byGender[gender] : GENDER_ORDER.map((g) => byGender[g]).find(Boolean);
      const source = views?.[angle];
      if (source) return { variant, length: entry, source };
    }
  }
  return null;
}

/**
 * Which variant a render lookup lands on.
 *
 * Worth having separately so a mask is taken from the *same* variant as the
 * render it is laid over. The two maps are built by one walk and normally agree,
 * but a mask that failed to compute leaves a hole in only one of them, and
 * masking a curly render with a coily mask would recolour the wrong pixels.
 */
export function renderVariant(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
  length?: HairLengthId,
): VariantId | null {
  return lookup(renderIndex(), styleId, gender, angle, variants, length)?.variant ?? null;
}

/**
 * Which length a lookup actually landed on — the one asked for, or the anchor it
 * fell back to, or null when there is no render at all.
 *
 * This is what lets the style screen tell the truth about a slider it cannot yet
 * honour: a stop whose render has not been generated resolves to the anchor, the
 * screen sees that the two disagree, and it says so under the control. The line
 * disappears on its own the moment the length renders land, with nothing to
 * remove.
 */
export function renderLength(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
  length?: HairLengthId,
): HairLengthId | null {
  return lookup(renderIndex(), styleId, gender, angle, variants, length)?.length ?? null;
}

export function mannequinRender(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
  length?: HairLengthId,
): RenderSource | null {
  return lookup(renderIndex(), styleId, gender, angle, variants, length)?.source ?? null;
}

/**
 * The hair mask for a render: white where the haircut is, black everywhere else,
 * so a colour grade can be held to the hair and off the mannequin.
 *
 * Resolved exactly like the render it belongs to, and independently of it: a
 * render whose mask has not been written yet returns null here and is graded
 * whole rather than not at all. `scripts/generate-hair-masks.mjs` writes them,
 * and the render module rebuild keeps them in step.
 *
 * The length is matched **exactly**, with none of the anchor fallback the render
 * lookup does. Callers pass the length the render actually resolved to, so the
 * only way the two could differ is a mask that failed to compute — and in that
 * case the honest answer is no mask (grade the whole image, the documented
 * degraded path) rather than the anchor's mask, which would hold the grade to
 * the wrong pixels on a longer cut.
 */
export function mannequinMask(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
  length?: HairLengthId,
): RenderSource | null {
  return lookup(maskIndex(), styleId, gender, angle, variants, length, true)?.source ?? null;
}

/** Whether any render at all exists for a style — used to pick a hero angle. */
export function hasMannequinRender(styleId: string | null | undefined): boolean {
  return !!(styleId && renderIndex()[styleId]);
}

/**
 * Every angle of one style as a set — the reference the try-on shows the model.
 *
 * The catalog's `<Mannequin>` asks for one angle at a time, but a preview needs
 * the whole cut: front, three-quarter, side and back of *the same haircut*, so
 * the model has something to build a consistent silhouette from rather than one
 * view to guess the rest of the head from.
 *
 * The variant is resolved once and every view then comes from it, for the same
 * reason a mask does: mixing the curly front with the coily back would hand the
 * model two haircuts and ask it for one. A variant with only some angles
 * generated returns only those, which is honest — three views of the right cut
 * beat four of two different ones.
 */
export function mannequinViews(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  variants?: VariantId[] | null,
  length: HairLengthId = ANCHOR_LENGTH,
): { variant: VariantId; length: HairLengthId; views: { angle: ViewAngle; source: RenderSource }[] } | null {
  const byVariant: RenderVariantMap | undefined = styleId ? renderIndex()[styleId] : undefined;
  if (!byVariant) return null;

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  for (const variant of wanted) {
    const byLength = byVariant[variant];
    if (!byLength) continue;
    // The length is resolved once and every view then comes from it, for the
    // same reason the variant is: a short front and a medium back would be two
    // haircuts handed to a model asked for one.
    for (const entry of lengthOrder(length, false)) {
      const byGender = byLength[entry];
      if (!byGender) continue;
      const views = gender ? byGender[gender] : GENDER_ORDER.map((g) => byGender[g]).find(Boolean);
      if (!views) continue;
      const found = VIEW_ANGLES.flatMap((angle) => {
        const source = views[angle];
        return source ? [{ angle, source }] : [];
      });
      if (found.length) return { variant, length: entry, views: found };
    }
  }
  return null;
}

/**
 * The candidates that carry a render of their own at this angle, in resolution
 * order — the set a card can cycle through under "All Types".
 *
 * `mannequinRender()` collapses a candidate list to one image: it walks the list
 * and stops at the first variant that exists. That is the right answer for a
 * single frame and the wrong one for showing that a cut comes in several. This
 * asks each candidate on its own instead, and keeps the ones that resolve.
 *
 * Deduped by source rather than by variant id, because the only thing worth
 * cycling is a *different image*: two candidates that fall back to the same file
 * would show as a pause on the same picture, which reads as a stutter rather
 * than as another version of the cut. A style with one render — or none — comes
 * back with fewer than two entries, and nothing animates.
 */
export function renderedVariants(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
  length?: HairLengthId,
): VariantId[] {
  const byVariant: RenderVariantMap | undefined = styleId ? renderIndex()[styleId] : undefined;
  if (!byVariant) return [];

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  const found: VariantId[] = [];
  const seen: RenderSource[] = [];
  for (const variant of wanted) {
    const hit = lookup(renderIndex(), styleId, gender, angle, [variant], length);
    if (!hit || seen.some((source) => sameSource(source, hit.source))) continue;
    seen.push(hit.source);
    found.push(variant);
  }
  return found;
}
