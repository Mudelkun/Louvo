/**
 * Hair colour, applied in the browser instead of generated into the imagery.
 *
 * A port of `src/lib/colorGrade.ts`, and the maths is unchanged because it is
 * not a preference — it is forced. The catalog is shot once per cut, in a fixed
 * shade, and colour is then one affine map per channel, anchored at white:
 *
 *     out = 1 - c * (1 - in)
 *
 * The distance from white — the ink — is scaled by `c`. White is a fixed point,
 * which is the whole reason a full-frame grade is safe here at all: the render
 * is white plastic on a white ground (measured mean #FCFCFC) with the hair as
 * the only dark thing in the frame, so scaling the ink lands on the hair and
 * leaves the head and the backdrop where they were.
 *
 * `c` is not a free parameter. It is fixed by the requirement that the render's
 * own hair tone lands exactly on the chosen colour: `c = (1 - target) / (1 - base)`.
 * A light target implies a small `c`, which compresses the hair's contrast —
 * platinum on a dark base comes out flatter than the render is, the way bleached
 * hair actually photographs. There is no way around that with an affine map.
 *
 * ## Two anchors, not one
 *
 * `any`, `straight` and `wavy` are shot espresso; **`curly` and `coily` are shot
 * black**, because espresso reads as a muddy mid-brown on a dense texture — a
 * coil is mostly self-shadow, with very little lit surface left to carry a hue.
 * So the grade has two anchors and every lookup resolves the render's *variant*
 * first. Grading a black render from the espresso anchor overshoots every
 * target, which is the bug this indirection exists to prevent.
 *
 * It is also why the site does not simply show renders "as shot": as shot is two
 * shades, so one grid would put a brown cut beside a black one and the
 * difference would read as a colour nobody chose. The session starts on jet
 * (`DEFAULT_HAIR_COLOR_ID`) — the espresso renders are graded onto black, and
 * the black ones barely move.
 *
 * ## What is different on the web
 *
 * The app has to solve the factors in whichever colour space the platform's
 * filter happens to run in, because `react-native-svg` exposes no way to say.
 * Here the filter is ours, so `color-interpolation-filters="sRGB"` is set on it
 * explicitly and the factors are always solved in sRGB. One space, every
 * browser, no per-engine drift.
 */

import type { HairColor, VariantId } from './contract/catalog';

type Rgb = [number, number, number];

/**
 * The shade each variant of the catalog was actually shot in.
 *
 * **Measured, never chosen** — one `scripts/measure-hair-tone.mjs` mean per
 * variant, re-run after every generation batch. Mirrored from `BASE_HAIR_COLORS`
 * in `src/lib/constants.ts`; if those numbers move because a batch was re-shot,
 * these move with them or every graded render on the web lands on the wrong
 * colour.
 */
export const BASE_HAIR_COLORS: Record<VariantId, string> = {
  any: '#443A32',
  straight: '#3A3129',
  wavy: '#362C25',
  curly: '#252420',
  coily: '#24231F',
};

/** The anchor for one render, by the variant it was shot as. */
export const baseHairColor = (variant: VariantId | null | undefined): string =>
  BASE_HAIR_COLORS[variant ?? 'any'] ?? BASE_HAIR_COLORS.any;

/**
 * The shade every mannequin is shown in until the user picks another.
 *
 * A starting value, not a lock — see the header for why it is a value at all
 * rather than "as shot".
 */
export const DEFAULT_HAIR_COLOR_ID = 'jet';

function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255) as Rgb;
}

/**
 * Per-channel ink factors taking the base tone to `targetHex`.
 *
 * Exported because it is the whole of the maths and is worth reading on its own;
 * `hairGrade` is only this packed into a filter matrix.
 */
export function inkFactors(targetHex: string, baseHex: string): Rgb {
  const base = parseHex(baseHex);
  const target = parseHex(targetHex);
  return target.map((value, index) => (1 - value) / Math.max(1e-4, 1 - base[index])) as Rgb;
}

/** Below this, a factor is close enough to 1 that grading would be invisible. */
const IDENTITY_EPSILON = 0.01;

/**
 * The `feColorMatrix` values that recolour a render, or null when the chosen
 * colour is the shade this render was already shot in.
 *
 * **Null is the point.** A render whose anchor already is the target is drawn
 * with no filter attached at all, which is most of the curly and coily catalog
 * under the default jet — no filter node, no extra layer, no compositing cost.
 */
export function hairGrade(targetHex: string | null | undefined, baseHex: string): number[] | null {
  if (!targetHex) return null;

  const [r, g, b] = inkFactors(targetHex, baseHex);
  if (
    Math.abs(r - 1) < IDENTITY_EPSILON &&
    Math.abs(g - 1) < IDENTITY_EPSILON &&
    Math.abs(b - 1) < IDENTITY_EPSILON
  ) {
    return null;
  }

  // Row-major 4x5 over non-premultiplied RGBA: each channel scaled by its
  // factor and offset so white maps to white. Alpha is untouched.
  return [r, 0, 0, 0, 1 - r, 0, g, 0, 0, 1 - g, 0, 0, b, 0, 1 - b, 0, 0, 0, 1, 0];
}

/** The colour a `HairColor` row should be graded to. */
export const targetHex = (color: HairColor | null | undefined): string | null => color?.hex ?? null;
