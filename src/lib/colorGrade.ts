/**
 * Hair colour, applied in the app instead of generated into the imagery.
 *
 * The catalog is shot once, in one shade (`BASE_HAIR_COLOR`), so the only thing
 * that differs between two mannequins is the cut. Colour is then a grade laid
 * over that single render at display time — no second generation, no second
 * asset, and a new shade costs nothing but a row in the catalog's colour list.
 *
 * The grade is one affine map per channel, anchored at white:
 *
 *     out = 1 - c * (1 - in)
 *
 * That is: the distance from white — the ink — is scaled by `c`. White is a
 * fixed point, which is the whole reason a full-frame grade is safe here. The
 * catalog render is white plastic on a white background (measured mean #FCFCFC)
 * with the hair as the only dark thing in the frame, so scaling the ink lands on
 * the hair and leaves the head and the background where they were. `c < 1`
 * lightens towards white, `c > 1` darkens, `c === 1` changes nothing.
 *
 * `c` is not a free parameter. It is fixed by the requirement that the render's
 * own hair tone lands exactly on the chosen colour: `c = (1 - target) / (1 - base)`.
 * A consequence worth knowing: a light target implies a small `c`, which
 * compresses the hair's contrast. Platinum on a dark base comes out flatter than
 * the render is, the way bleached hair actually photographs. There is no way
 * around it with an affine map, and a non-linear transfer (`feComponentTransfer`)
 * is not implemented on native by react-native-svg.
 *
 * A grade cannot be applied to the *procedural* mannequin and does not need to
 * be: that one is drawn straight in the chosen hex (see `<Mannequin>`).
 */

import { Platform } from 'react-native';

import type { HairColor } from '@/api/types';
import { BASE_HAIR_COLOR } from '@/lib/constants';

type Rgb = [number, number, number];

/**
 * Which colour space the grade will actually be applied in.
 *
 * The three renderers disagree, and this is not something the SVG can settle:
 * Android runs `feColorMatrix` over sRGB bitmap values, while iOS puts it
 * through Core Image and the browser through a real SVG filter — both of which
 * work in linear RGB by default, and react-native-svg exposes no
 * `color-interpolation-filters` prop to change that. So the factors are solved
 * in whichever space is going to be used, which lands the chosen colour on every
 * platform. Only the rolloff through the shadows differs, and only slightly.
 */
export type GradeSpace = 'srgb' | 'linear';

export const gradeSpace = (): GradeSpace => (Platform.OS === 'android' ? 'srgb' : 'linear');

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

const channels = (hex: string, space: GradeSpace): Rgb => {
  const rgb = parseHex(hex);
  return space === 'linear' ? (rgb.map(toLinear) as Rgb) : rgb;
};

/**
 * Per-channel ink factors taking the base tone to `targetHex`.
 *
 * Exported because it is the whole of the maths and is worth being able to read
 * on its own; `hairGrade` is just this packed into a filter matrix.
 */
export function inkFactors(
  targetHex: string,
  baseHex: string = BASE_HAIR_COLOR.hex,
  space: GradeSpace = gradeSpace(),
): Rgb {
  const base = channels(baseHex, space);
  const target = channels(targetHex, space);
  return target.map((t, i) => (1 - t) / Math.max(1e-4, 1 - base[i])) as Rgb;
}

/** Below this, a factor is close enough to 1 that grading would be invisible. */
const IDENTITY_EPSILON = 0.01;

/**
 * The `feColorMatrix` values that recolour a catalog render, or null when the
 * chosen colour is the shade the catalog was already shot in.
 *
 * Null is the point: the render is drawn with no filter attached at all, so a
 * shade the catalog was already shot in costs nothing. It is drawn through the
 * same `<Svg>` either way — `<Mannequin>` used to switch to an `<Image>` here,
 * which made the presence of a grade a change of component and put a blank
 * frame into every hair-type switch that crossed between the two base shades.
 */
export function hairGrade(
  color: HairColor | null | undefined,
  baseHex: string = BASE_HAIR_COLOR.hex,
): number[] | null {
  if (!color) return null;

  const [r, g, b] = inkFactors(color.hex, baseHex);
  if (Math.abs(r - 1) < IDENTITY_EPSILON && Math.abs(g - 1) < IDENTITY_EPSILON && Math.abs(b - 1) < IDENTITY_EPSILON) {
    return null;
  }

  // Row-major 4x5, operating on non-premultiplied RGBA: each channel is scaled
  // by its factor and offset so that white maps to white. Alpha is untouched.
  return [
    r, 0, 0, 0, 1 - r,
    0, g, 0, 0, 1 - g,
    0, 0, b, 0, 1 - b,
    0, 0, 0, 1, 0,
  ];
}
