import { mannequinMasks, mannequinRenders, type MannequinRenderMap, type RenderSource } from '@/api/mannequinRenders.generated';
import type { Gender } from '@/api/types';
import type { ViewAngle } from '@/lib/hairShape';

/**
 * The AI-generated mannequin render for a style, if one has been generated.
 *
 * `scripts/generate-mannequins.mjs` writes the PNGs and rewrites the generated
 * module every run, so a style picked up here appears in the app as soon as its
 * images land — nothing else has to be edited. Styles with no render yet fall
 * back to the procedural drawing in `<Mannequin>`, which is why every lookup
 * returns `null` rather than a placeholder.
 *
 * Only an exact angle match is used: a fade shot from the side is not an honest
 * stand-in for the same fade from behind. Gender is matched exactly too when the
 * caller knows it; when it does not (the catalog before the user has chosen),
 * whichever variant exists is shown, male first.
 */
const GENDER_ORDER: Gender[] = ['male', 'female'];

function lookup(
  map: Record<string, MannequinRenderMap>,
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
): RenderSource | null {
  const byGender = styleId ? map[styleId] : undefined;
  if (!byGender) return null;

  const variant = gender ? byGender[gender] : GENDER_ORDER.map((g) => byGender[g]).find(Boolean);
  return variant?.[angle] ?? null;
}

export function mannequinRender(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
): RenderSource | null {
  return lookup(mannequinRenders, styleId, gender, angle);
}

/**
 * The hair mask for a render: white where the haircut is, black everywhere else,
 * so a colour grade can be held to the hair and off the mannequin.
 *
 * Resolved exactly like the render it belongs to, and independently of it: a
 * render whose mask has not been written yet returns null here and is graded
 * whole rather than not at all. `scripts/generate-hair-masks.mjs` writes them,
 * and the render module rebuild keeps them in step.
 */
export function mannequinMask(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
): RenderSource | null {
  return lookup(mannequinMasks, styleId, gender, angle);
}

/** Whether any render at all exists for a style — used to pick a hero angle. */
export function hasMannequinRender(styleId: string | null | undefined): boolean {
  return !!(styleId && mannequinRenders[styleId]);
}
