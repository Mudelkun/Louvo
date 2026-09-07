import type { HairColor, HairShape, VariantId } from '@/api/types';

/**
 * Sentinel photo uri used by the "use a sample photo" path.
 *
 * It lets the whole flow be exercised on a simulator, on the web, or with photo
 * permissions denied. Anywhere a photo would be shown, this renders the neutral
 * mannequin instead — and the "generated" result renders the same mannequin
 * wearing the chosen style, so before/after stays meaningful.
 */
export const DEMO_PHOTO = 'luvo://sample-photo';

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
  any: { id: 'espresso', name: 'Espresso', hex: '#443A32', shade: '#241B15' },
  straight: { id: 'espresso', name: 'Espresso', hex: '#3A3129', shade: '#241B15' },
  wavy: { id: 'espresso', name: 'Espresso', hex: '#362C25', shade: '#241B15' },
  // Measured, not chosen — one `measure-hair-tone.mjs` mean per variant, re-run
  // after every batch. `curly` joined `coily` on black when both were re-shot,
  // so it is a jet anchor now and not an espresso one; the two land within a
  // level of each other, which is the pair reading as one shade. `any` is the
  // loosest figure here — 8 renders from two styles (buzz-cut, box-braids), both
  // short enough that the mean picks up more lit surface than a longer cut does.
  curly: { id: 'jet', name: 'Jet Black', hex: '#252420', shade: '#151413' },
  coily: { id: 'jet', name: 'Jet Black', hex: '#24231F', shade: '#151413' },
};

/**
 * The shade the catalog is drawn in when nothing more specific is known — the
 * procedural mannequin, the sample photo, the welcome screen.
 */
export const BASE_HAIR_COLOR: HairColor = BASE_HAIR_COLORS.any;

/**
 * The shade every mannequin is shown in until the user picks another.
 *
 * The session starts on a colour rather than on "as shot" because "as shot" is
 * not one look: the coily variant is shot in black and everything else in
 * espresso (see `BASE_HAIR_COLORS`), so an ungraded catalog puts a brown cut
 * next to a black one in the same grid and the difference reads as a colour the
 * user did not choose. Black is the shade that costs the least to standardise
 * on: the espresso renders are graded onto it (measured on a real render, the
 * hair's mean goes #392B22 → #1C1513) and the coily ones barely move, since
 * their anchor is already within a level or two of it — in linear space, the
 * one iOS and web grade in, close enough that `hairGrade()` returns null and
 * they are shown untouched. Nothing is re-shot for any of it.
 *
 * It is a catalog colour id rather than a `HairColor` because it is a *choice*,
 * the same one a picker would make. `setColor(null)` still means "however this
 * render was shot" and still short-circuits the grade; nothing about the two
 * anchors changes.
 */
export const DEFAULT_HAIR_COLOR_ID = 'jet';

/** The anchor for one render, by the variant it was shot as. */
export const baseHairColor = (variant: VariantId | null | undefined): HairColor =>
  BASE_HAIR_COLORS[variant ?? 'any'] ?? BASE_HAIR_COLOR;

