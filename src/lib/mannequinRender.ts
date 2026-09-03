import {
  mannequinMasks,
  mannequinRenders,
  type MannequinVariantMap,
  type RenderSource,
} from '@/api/mannequinRenders.generated';
import type { Gender, VariantId } from '@/api/types';
import { VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';

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

function lookup(
  map: Record<string, MannequinVariantMap>,
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants: VariantId[] | null | undefined,
): { variant: VariantId; source: RenderSource } | null {
  const byVariant = styleId ? map[styleId] : undefined;
  if (!byVariant) return null;

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  for (const variant of wanted) {
    const byGender = byVariant[variant];
    if (!byGender) continue;
    const views = gender ? byGender[gender] : GENDER_ORDER.map((g) => byGender[g]).find(Boolean);
    const source = views?.[angle];
    if (source) return { variant, source };
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
): VariantId | null {
  return lookup(mannequinRenders, styleId, gender, angle, variants)?.variant ?? null;
}

export function mannequinRender(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  angle: ViewAngle,
  variants?: VariantId[] | null,
): RenderSource | null {
  return lookup(mannequinRenders, styleId, gender, angle, variants)?.source ?? null;
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
  variants?: VariantId[] | null,
): RenderSource | null {
  return lookup(mannequinMasks, styleId, gender, angle, variants)?.source ?? null;
}

/** Whether any render at all exists for a style — used to pick a hero angle. */
export function hasMannequinRender(styleId: string | null | undefined): boolean {
  return !!(styleId && mannequinRenders[styleId]);
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
): { variant: VariantId; views: { angle: ViewAngle; source: RenderSource }[] } | null {
  const byVariant = styleId ? mannequinRenders[styleId] : undefined;
  if (!byVariant) return null;

  const wanted = variants ?? (Object.keys(byVariant) as VariantId[]);
  for (const variant of wanted) {
    const byGender = byVariant[variant];
    if (!byGender) continue;
    const views = gender ? byGender[gender] : GENDER_ORDER.map((g) => byGender[g]).find(Boolean);
    if (!views) continue;
    const found = VIEW_ANGLES.flatMap((angle) => {
      const source = views[angle];
      return source ? [{ angle, source }] : [];
    });
    if (found.length) return { variant, views: found };
  }
  return null;
}
