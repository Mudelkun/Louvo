/**
 * The hair-type sheet: all four hair types on one head, in one generated image,
 * cut into four PNGs locally.
 *
 * This is *not* the catalog's four-view sheet and must not drift towards it. The
 * catalog sheet answers "what does this haircut look like from behind"; this one
 * answers "what does my hair do", which is the question the picker in
 * `app/try/hair-type.tsx` asks. So the panels are the four types rather than
 * four camera angles, the head is shot once per gender rather than once per
 * hairstyle, and the crop is tight on the hair instead of framing the mannequin's
 * display base — at the size these are shown, a wide catalog framing would be
 * mostly plastic.
 *
 * One generation per gender, for the same reason the catalog uses a sheet: four
 * separate generations are four independent rolls of the head, and the whole
 * point of the image is that the *only* difference between the panels is the
 * curl pattern. Drawn in one pass the model is committing to one head and
 * showing it four ways.
 */

import { HAIR_LUMA, formatCoverage, gridLabel, hairCoverage, panelOf, sliceGrid } from './grid.mjs';
import { decodePng, encodePng, resizeImage } from './png.mjs';

export { formatCoverage };

/**
 * A 2×2 grid read left to right, top to bottom, in type order — type 1 top
 * left, type 4 bottom right. The order is the typing system's own and the same
 * one the picker lists, so a panel is identified by where it sits and nothing
 * has to be labelled in the image itself.
 */
export const TYPE_SHEET = {
  cols: 2,
  rows: 2,
  cells: ['straight', 'wavy', 'curly', 'coily'],
  positions: ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'],
};

export const HAIR_TYPE_CELLS = TYPE_SHEET.cells;

/** How a panel is named to the model — "Top-left" and friends. */
export const typePanelLabel = (type) => gridLabel(TYPE_SHEET, type);

/**
 * Cuts a generated sheet into one PNG per hair type.
 *
 * @returns {{ type: string, png: Buffer, crop: object }[]}
 */
export function sliceTypeSheet(buffer, { types = HAIR_TYPE_CELLS, inset = 0 } = {}) {
  return sliceGrid(buffer, TYPE_SHEET, { cells: types, inset }).map((panel) => ({
    type: panel.cell,
    crop: panel.crop,
    png: encodePng(panel.image),
  }));
}

/**
 * Hair coverage below which a panel has no hair on it at all.
 *
 * The same 3% the catalog sheets use (`HAIR_COVERAGE_FLOOR` in lib/sheet.mjs),
 * and for the same reason: it is the measured gap between a mannequin's own
 * shading (0.1-0.7% of the frame) and the least hair any generated image has
 * shown (9.5%). Every panel here carries a full head of hair, so it
 * clears the line by much more than a catalog fade does.
 */
export const HAIR_COVERAGE_FLOOR = 0.03;

/**
 * Silhouette difference below which two panels are the same picture twice.
 *
 * The failure mode here is not the catalog's — nothing comes back bald when the
 * prompt asks for four heads of hair. It is that the model draws one texture
 * four times, or slides types 1 and 2 into each other, and an example image
 * where straight and wavy are the same picture teaches the user nothing.
 *
 * Measured as the fraction of pixels where one panel says "hair" and the other
 * says "mannequin", after both are reduced to a 96px binary silhouette — a
 * thresholded comparison rather than a pixel difference, so generation noise
 * does not register as a difference and a genuinely different mass does.
 *
 * Still an estimate rather than a measurement, which is why it only ever warns.
 * Five sheets in, the pairs have run 2.8% to 21%, and the one pair that tripped
 * the original 4% — a men's curly beside a men's coily — was clearly two
 * different textures when looked at. So the line is at 2.5%: below that is
 * reserved for a pair that really is one picture twice. Every pair is printed on
 * each run, so it stays tunable by reading the numbers.
 */
export const SILHOUETTE_FLOOR = 0.025;

const SILHOUETTE_SIZE = 96;

/** A panel reduced to a small binary hair/not-hair map. */
function silhouette(image) {
  const small = resizeImage(image, SILHOUETTE_SIZE, SILHOUETTE_SIZE);
  const { channels, pixels } = small;
  const map = new Uint8Array(SILHOUETTE_SIZE * SILHOUETTE_SIZE);
  for (let i = 0; i < map.length; i += 1) {
    const offset = i * channels;
    const r = pixels[offset];
    const g = channels >= 3 ? pixels[offset + 1] : r;
    const b = channels >= 3 ? pixels[offset + 2] : r;
    map[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b < HAIR_LUMA ? 1 : 0;
  }
  return map;
}

/** Fraction of pixels the two silhouettes disagree about. */
function silhouetteDistance(a, b) {
  let differing = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) differing += 1;
  return differing / a.length;
}

/**
 * Measures a generated sheet: is there hair in every panel, and are the four
 * panels actually four different things.
 *
 * A third failure — the men's sheet coming back in a shoulder-length bob — is
 * deliberately not measured here. It looks measurable and is not: the crop
 * leaves white space under the head, so a hanging length and a crop that ends
 * above the ears put the same (nearly nothing) into the bottom of the frame, and
 * a band measurement flags panels at random. It is fought in the prompt instead,
 * and judged by eye.
 *
 * @returns {{ coverage: Record<string, number>, bald: string[],
 *            distance: Record<string, number>, alike: [string, string][] }}
 */
export function inspectTypeSheet(buffer, { types = HAIR_TYPE_CELLS } = {}) {
  const image = decodePng(buffer);
  const panels = Object.fromEntries(types.map((type) => [type, panelOf(image, TYPE_SHEET, type).image]));

  const coverage = Object.fromEntries(types.map((type) => [type, hairCoverage(panels[type])]));
  const shapes = Object.fromEntries(types.map((type) => [type, silhouette(panels[type])]));

  const distance = {};
  const alike = [];
  for (let i = 0; i < types.length; i += 1) {
    for (let j = i + 1; j < types.length; j += 1) {
      const [a, b] = [types[i], types[j]];
      const value = silhouetteDistance(shapes[a], shapes[b]);
      distance[`${a}/${b}`] = value;
      if (value < SILHOUETTE_FLOOR) alike.push([a, b]);
    }
  }

  return {
    coverage,
    bald: types.filter((type) => coverage[type] < HAIR_COVERAGE_FLOOR),
    distance,
    alike,
  };
}

/** `straight/wavy 7.2%, straight/curly 12.0%` — distances as they are printed. */
export function formatDistance(distance) {
  return Object.entries(distance)
    .map(([pair, value]) => `${pair} ${(value * 100).toFixed(1)}%`)
    .join(', ');
}


