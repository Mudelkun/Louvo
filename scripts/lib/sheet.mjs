/**
 * The four-view sheet: all four angles of a haircut in one generated image, cut
 * into four PNGs locally.
 *
 * Why a sheet instead of four generations:
 *
 *   1. Consistency. Four separate generations are four independent rolls: the
 *      fade lands at a different height in the profile than in the three-quarter,
 *      the fringe parts the other way from behind. Drawn in one pass the model is
 *      committing to *one* haircut and showing it four times.
 *   2. Cost. One generation per style × gender instead of four.
 *
 * The base sheet is not generated at all — it is **composed** from base heads
 * that have already been approved one by one (`composeSheet`). That is the whole
 * point: the four camera angles come from images you have looked at and accepted,
 * so no prompt gets the chance to re-pose them, and every style inherits those
 * exact angles by being an edit of the composed sheet.
 *
 * The layout below is the single source of truth: `lib/prompts.mjs` describes it
 * to the model in words, and the crop maths in `lib/grid.mjs` reads the same
 * constant.
 */

import { HAIR_LUMA, formatCoverage, gridLabel, gridRect, hairCoverage, panelOf, sliceGrid } from './grid.mjs';
import { blankImage, cropImage, decodePng, encodePng, pasteImage, resizeImage } from './png.mjs';

export { HAIR_LUMA, formatCoverage };

/**
 * A 2×2 grid, read left to right and top to bottom. Square panels in a square
 * frame: each view is framed the way `HOUSE_STYLE` describes a single portrait,
 * so a panel crop is the image the app would have got from its own generation.
 */
export const SHEET = {
  cols: 2,
  rows: 2,
  /** Panel order, row-major from the top left. */
  cells: ['front', 'half', 'side', 'back'],
  /** How each panel is named to the model — must match `cells` order. */
  positions: ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'],
};

export const SHEET_ANGLES = SHEET.cells;

/** Where one panel sits, as a fraction of the sheet. */
export const cellRect = (angle) => gridRect(SHEET, angle);

/** How a panel is named to the model — "Top-left" and friends. */
export const panelLabel = (angle) => gridLabel(SHEET, angle);

/**
 * Tiles approved base heads into one sheet — no model, no cost, no drift.
 *
 * Panels are square and all the same size — the smallest side of the smallest
 * input, so no head is ever upscaled. Each head is centre-cropped to a square and
 * then resampled to the cell, because base heads do not all arrive at the same
 * resolution and mismatched panel scales would break the one thing the sheet is
 * for. Any angle with no image is left white rather than failing, so a partial
 * sheet can still be eyeballed.
 *
 * @param {Record<string, Buffer>} byAngle  angle -> PNG buffer
 * @returns {Buffer} the composed sheet as PNG
 */
export function composeSheet(byAngle) {
  const decoded = Object.fromEntries(
    Object.entries(byAngle).map(([angle, buffer]) => [angle, decodePng(buffer)]),
  );

  const images = Object.values(decoded);
  if (!images.length) throw new Error('composeSheet needs at least one base head');

  const missing = SHEET.cells.filter((angle) => !decoded[angle]);
  const cell = Math.min(...images.flatMap((image) => [image.width, image.height]));
  const { channels, colorType } = images[0];
  if (images.some((image) => image.channels !== channels)) {
    throw new Error('the base heads disagree on channel count — regenerate them from one run');
  }

  const sheet = blankImage(cell * SHEET.cols, cell * SHEET.rows, channels, colorType);

  for (const [index, angle] of SHEET.cells.entries()) {
    const image = decoded[angle];
    if (!image) continue;

    // Square first (keeping the middle), then scale — cropping straight to the
    // cell would cut the head off whenever the source is larger.
    const side = Math.min(image.width, image.height);
    const square = cropImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side);
    pasteImage(sheet, resizeImage(square, cell), (index % SHEET.cols) * cell, Math.floor(index / SHEET.cols) * cell);
  }

  return { png: encodePng(sheet), cell, missing };
}

/**
 * Cuts a generated sheet into one buffer per angle.
 *
 * `inset` trims that many pixels off every panel edge. It defaults to 0 — the
 * prompt asks for panels that meet edge to edge — and exists for the run where
 * the model draws a hairline divider anyway, so a sheet can be re-cut (free)
 * instead of regenerated.
 *
 * @param {Buffer} buffer  the generated PNG
 * @param {{ angles?: string[], inset?: number }} [options]
 * @returns {{ angle: string, png: Buffer, crop: { x: number, y: number, width: number, height: number } }[]}
 */
export function sliceSheet(buffer, { angles = SHEET_ANGLES, inset = 0 } = {}) {
  return sliceGrid(buffer, SHEET, { cells: angles, inset }).map((panel) => ({
    angle: panel.cell,
    crop: panel.crop,
    png: encodePng(panel.image),
  }));
}

// ---------------------------------------------------------------------------
// Bald-panel detection
//
// The edit model does not always dress all four heads. Roughly one panel in
// eight comes back untouched — the bald base head sitting next to three views
// wearing the haircut — and it is `front`, the flattest and least hair-revealing
// view, that gets skipped most often. Nothing about the response says so: the
// sheet arrives looking like any other success, so it has to be measured.
// ---------------------------------------------------------------------------

/**
 * Hair coverage below which a panel is considered bald.
 *
 * Measured, not guessed. Across the first fifteen style sheets the styled panels
 * covered 9.5%-52% of their frame in hair-dark pixels — the 9.5% being a low
 * taper fade seen dead-on, the least hair any catalog cut has shown — while
 * every panel the model had skipped came in between 0.1% and 0.7%: the
 * mannequin's own shading and the shadow under its jaw. Nothing has landed in
 * between, so 3% clears a shaved cut and a heavily shadowed bald head alike.
 */
export const HAIR_COVERAGE_FLOOR = 0.03;

/**
 * Measures every panel of a sheet and reports the ones the model left bald.
 *
 * @param {Buffer} buffer  the generated PNG
 * @param {{ angles?: string[] }} [options]
 * @returns {{ coverage: Record<string, number>, bald: string[] }}
 */
export function inspectSheet(buffer, { angles = SHEET_ANGLES } = {}) {
  const image = decodePng(buffer);
  const coverage = Object.fromEntries(
    angles.map((angle) => [angle, hairCoverage(panelOf(image, SHEET, angle).image)]),
  );
  return { coverage, bald: angles.filter((angle) => coverage[angle] < HAIR_COVERAGE_FLOOR) };
}
