import type { HairColor, HairShape, VariantId } from '@/api/types';

/**
 * Sentinel photo uri used by the "use a sample photo" path.
 *
 * It lets the whole flow be exercised on a simulator, on the web, or with photo
 * permissions denied. Anywhere a photo would be shown, this renders the neutral
 * mannequin instead — and the "generated" result renders the same mannequin
 * wearing the chosen style, so before/after stays meaningful.
 */
export const DEMO_PHOTO = 'hairify://sample-photo';

/** The hair the sample subject starts with, before any style is applied. */
export const DEMO_BASE_SHAPE: HairShape = {
  top: 0.3,
  sides: 0.34,
  back: 0.12,
  fringe: 0.34,
  texture: 'wavy',
};

/**
 * The shade a render was *shot* in, and the anchor its colour grade starts from.
 *
 * These are not design choices. Each `hex` is the mean colour of the hair pixels
 * across the renders shot in that shade, measured with the same luma threshold
 * the generator uses to tell hair from mannequin — the generator asks for one
 * colour and gets back something a shade off it, and what a grade has to start
 * from is what actually came back. `node scripts/measure-hair-tone.mjs` prints
 * one mean per variant; re-measure after re-shooting anything.
 *
 * There are two of them rather than one because the coily variant is shot in
 * black: espresso reads as a muddy mid-brown on type 4 coils, which are mostly
 * self-shadow with very little lit surface to carry a hue. See `HAIR_COLOURS` in
 * `scripts/lib/prompts.mjs`. This is still not colour-per-style — no hairstyle
 * has its own shade, and a shade the *user* can pick is still a row in the
 * catalog's colour list costing no generation. It just means the grade has two
 * starting points, and has to be told which render it is looking at.
 *
 * Picking the anchor shade in the app is a no-op: `hairGrade()` returns null for
 * it and the render is shown untouched. See `src/lib/colorGrade.ts`.
 */
export const BASE_HAIR_COLORS: Record<VariantId, HairColor> = {
  any: { id: 'espresso', name: 'Espresso', hex: '#3B2C24', shade: '#241B15' },
  straight: { id: 'espresso', name: 'Espresso', hex: '#392D24', shade: '#241B15' },
  wavy: { id: 'espresso', name: 'Espresso', hex: '#392D24', shade: '#241B15' },
  curly: { id: 'espresso', name: 'Espresso', hex: '#392D24', shade: '#241B15' },
  // Measured across the four coily renders on disk (`measure-hair-tone.mjs`),
  // replacing the value extrapolated from espresso's drift before any coily
  // render existed. Re-measure when the coily batch grows past low-taper-fade.
  coily: { id: 'jet', name: 'Jet Black', hex: '#232220', shade: '#151413' },
};

/**
 * The shade the catalog is drawn in when nothing more specific is known — the
 * procedural mannequin, the sample photo, the welcome screen.
 */
export const BASE_HAIR_COLOR: HairColor = BASE_HAIR_COLORS.any;

/** The anchor for one render, by the variant it was shot as. */
export const baseHairColor = (variant: VariantId | null | undefined): HairColor =>
  BASE_HAIR_COLORS[variant ?? 'any'] ?? BASE_HAIR_COLOR;

/** photo, gender, hair type, category+catalog, style detail. */
export const TRY_ON_STEPS = 5;
