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
 * to the model in words, and the crop maths here reads the same constant.
 */

import { blankImage, cropImage, decodePng, encodePng, pasteImage, resizeImage } from './png.mjs';

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
export function cellRect(angle) {
  const index = SHEET.cells.indexOf(angle);
  if (index < 0) throw new Error(`"${angle}" is not a panel on the sheet`);
  return {
    x: (index % SHEET.cols) / SHEET.cols,
    y: Math.floor(index / SHEET.cols) / SHEET.rows,
    width: 1 / SHEET.cols,
    height: 1 / SHEET.rows,
  };
}

/** How a panel is named to the model — "Top-left" and friends. */
export function panelLabel(angle) {
  const index = SHEET.cells.indexOf(angle);
  if (index < 0) throw new Error(`"${angle}" is not a panel on the sheet`);
  return SHEET.positions[index];
}

/** One panel out of a decoded sheet, with the crop that produced it. */
function panelOf(image, angle, inset = 0) {
  const rect = cellRect(angle);
  const crop = {
    x: Math.round(rect.x * image.width + inset),
    y: Math.round(rect.y * image.height + inset),
    width: Math.round(rect.width * image.width - inset * 2),
    height: Math.round(rect.height * image.height - inset * 2),
  };
  return { crop, image: cropImage(image, crop.x, crop.y, crop.width, crop.height) };
}

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
  const image = decodePng(buffer);
  const panelWidth = image.width / SHEET.cols;
  const panelHeight = image.height / SHEET.rows;

  if (panelWidth < 64 || panelHeight < 64) {
    throw new Error(`sheet is only ${image.width}x${image.height} — panels would be unusably small`);
  }

  return angles.map((angle) => {
    const panel = panelOf(image, angle, inset);
    return { angle, crop: panel.crop, png: encodePng(panel.image) };
  });
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
 * Luminance below which a pixel is hair rather than mannequin.
 *
 * The material is matte white with shadows bottoming out around #D4D1CD (212),
 * and catalog hair is espresso brown (#33231B, luma 40). 150 sits in the gap:
 * dark enough that no amount of shading under a jaw counts as hair, light
 * enough to catch the soft edge of a fade.
 */
export const HAIR_LUMA = 150;

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

/** Fraction of a panel's opaque pixels that are hair-dark. */
function hairCoverage(image) {
  const { width, height, channels, pixels } = image;
  let hair = 0;
  let counted = 0;

  for (let offset = 0; offset < width * height * channels; offset += channels) {
    if (channels === 4 && pixels[offset + 3] < 16) continue;
    const r = pixels[offset];
    const g = channels >= 3 ? pixels[offset + 1] : r;
    const b = channels >= 3 ? pixels[offset + 2] : r;
    counted += 1;
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < HAIR_LUMA) hair += 1;
  }

  return counted ? hair / counted : 0;
}

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
    angles.map((angle) => [angle, hairCoverage(panelOf(image, angle).image)]),
  );
  return { coverage, bald: angles.filter((angle) => coverage[angle] < HAIR_COVERAGE_FLOOR) };
}

/** `front 0.6%, side 0.5%` — coverage as it is printed in a warning. */
export function formatCoverage(coverage, angles = Object.keys(coverage)) {
  return angles.map((angle) => `${angle} ${(coverage[angle] * 100).toFixed(1)}%`).join(', ');
}
