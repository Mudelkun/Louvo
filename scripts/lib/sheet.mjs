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
import { ANCHOR_LENGTH } from './lengths.mjs';
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
  return composeGrid(SHEET, byAngle);
}

/**
 * Tiles approved base heads onto any grid — no model, no cost, no drift.
 *
 * Split out of `composeSheet` when the length sheet arrived, because the two
 * layouts differ only in how many cells there are and what each one is called.
 * The tiling itself is the part that must not differ: mismatched panel scales
 * would break the one thing a sheet is for.
 *
 * `byCell` maps a cell id to a PNG buffer, and the same head appearing in
 * several cells is normal — a length sheet is the same four base heads drawn
 * once per row. Panels are square and all the same size (the smallest side of
 * the smallest input, so no head is ever upscaled); each head is centre-cropped
 * to a square and then resampled to the cell. A cell with no image is left white
 * rather than failing, so a partial grid can still be eyeballed.
 *
 * @param {{ cols: number, rows: number, cells: string[] }} layout
 * @param {Record<string, Buffer>} byCell  cell id -> PNG buffer
 * @returns {{ png: Buffer, cell: number, missing: string[] }}
 */
export function composeGrid(layout, byCell) {
  const decoded = Object.fromEntries(
    Object.entries(byCell).map(([cell, buffer]) => [cell, decodePng(buffer)]),
  );

  const images = Object.values(decoded);
  if (!images.length) throw new Error('composeGrid needs at least one base head');

  const missing = layout.cells.filter((cell) => !decoded[cell]);
  const cell = Math.min(...images.flatMap((image) => [image.width, image.height]));
  const { channels, colorType } = images[0];
  if (images.some((image) => image.channels !== channels)) {
    throw new Error('the base heads disagree on channel count — regenerate them from one run');
  }

  const sheet = blankImage(cell * layout.cols, cell * layout.rows, channels, colorType);

  for (const [index, id] of layout.cells.entries()) {
    const image = decoded[id];
    if (!image) continue;

    // Square first (keeping the middle), then scale — cropping straight to the
    // cell would cut the head off whenever the source is larger.
    const side = Math.min(image.width, image.height);
    const square = cropImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side);
    pasteImage(sheet, resizeImage(square, cell), (index % layout.cols) * cell, Math.floor(index / layout.cols) * cell);
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

// ---------------------------------------------------------------------------
// Length sheets
//
// The same idea one dimension further out: three lengths of one haircut, each
// from four angles, in a single generation. It is the same argument sheet mode
// already makes — three separate sheets would be three independent rolls, and a
// length slider is *more* exposed to drift than the angle set is, because the
// user A/Bs the three images directly by dragging between them. Any wander in
// the fringe or the parting reads as the slider changing the haircut rather than
// its length, which is the one thing the control must not do.
//
// The frame has to grow with the panel count. A 12-panel grid drawn at the 1K
// the four-view sheet uses gives ~341x256 panels against today's 512x512, and
// CLAUDE.md already records what that costs: at 1K a fade's stubble field and
// the separation at a hairline land under a pixel and come back as a smooth
// mass. So a length sheet is asked for at 2K, where a 4x3 frame is 2048x1536 and
// a panel is 512x512 — exactly the resolution every render on disk already has.
// See `--resolution` in generate-mannequins.mjs.
// ---------------------------------------------------------------------------

/** `short:front` — a length sheet's cell id. */
export const lengthCell = (length, angle) => `${length}:${angle}`;

/** Splits one back apart. */
export const parseLengthCell = (cell) => {
  const [length, angle] = cell.split(':');
  return { length, angle };
};

const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The grid for one style x gender: one row per length, one column per angle.
 *
 * Rows are lengths rather than columns on purpose. The four angles are already
 * a row in the four-view sheet the model has been drawing all along, so keeping
 * them as a row means each row of a length sheet is a sheet the model has
 * effectively drawn before — the new instruction is "now do that again, longer",
 * which is a smaller ask than "vary length left to right and angle top to
 * bottom". It also puts the three versions of one angle in a column, which is
 * how a human checks the sheet: read down the `half` column and the length
 * progression is either there or it is not.
 *
 * @param {string[]} lengths  in slider order, short to long
 */
export function lengthSheet(lengths) {
  return {
    cols: SHEET.cells.length,
    rows: lengths.length,
    cells: lengths.flatMap((length) => SHEET.cells.map((angle) => lengthCell(length, angle))),
    positions: lengths.flatMap((length) =>
      SHEET.cells.map((angle) => `${titleCase(length)} row, ${angle} view`),
    ),
    /** Kept so callers can name the rows without re-deriving them. */
    lengths,
  };
}

/** The base grid to compose: the same four approved heads once per length row. */
export function lengthBaseCells(byAngle, lengths) {
  return Object.fromEntries(
    lengths.flatMap((length) =>
      SHEET.cells.flatMap((angle) => (byAngle[angle] ? [[lengthCell(length, angle), byAngle[angle]]] : [])),
    ),
  );
}

/**
 * Cuts a generated length sheet into one buffer per length x angle.
 *
 * @returns {{ length: string, angle: string, png: Buffer, crop: object }[]}
 */
export function sliceLengthSheet(buffer, lengths, { angles = SHEET_ANGLES, inset = 0 } = {}) {
  const layout = lengthSheet(lengths);
  const cells = lengths.flatMap((length) => angles.map((angle) => lengthCell(length, angle)));
  return sliceGrid(buffer, layout, { cells, inset }).map((panel) => ({
    ...parseLengthCell(panel.cell),
    crop: panel.crop,
    png: encodePng(panel.image),
  }));
}

/**
 * Measures every panel of a length sheet and reports the ones the model left
 * bald — the same check `inspectSheet` runs, against the same measured floor.
 *
 * Worth more here than on a four-view sheet, not less: twelve heads is three
 * times the opportunity to skip one, and a skipped panel in the `short` row is
 * indistinguishable from a legitimately very short cut to anything but this
 * measurement.
 */
export function inspectLengthSheet(buffer, lengths, { angles = SHEET_ANGLES } = {}) {
  const layout = lengthSheet(lengths);
  const image = decodePng(buffer);
  const cells = lengths.flatMap((length) => angles.map((angle) => lengthCell(length, angle)));
  const coverage = Object.fromEntries(
    cells.map((cell) => [cell, hairCoverage(panelOf(image, layout, cell).image)]),
  );
  return { coverage, bald: cells.filter((cell) => coverage[cell] < HAIR_COVERAGE_FLOOR) };
}

/**
 * How much more hair each row must carry than the one above it.
 *
 * Coverage is the fraction of a panel that is hair-dark pixels. It does not
 * scale with length in any tidy way — hair that grows past the bottom of the
 * frame stops adding pixels — so this is a floor on how *visible* the step is,
 * not a measurement of how many centimetres came off.
 *
 * Both numbers are measured from real sheets rather than guessed, which is the
 * only reason they are worth anything. The first three length sheets came back:
 *
 *   box-braids/any    16.9% -> 26.4% -> 31.0%   (x1.56, x1.17)  spread x1.83
 *   afro/curly        18.5% -> 21.5% -> 29.6%   (x1.16, x1.37)  spread x1.60
 *   afro/coily        17.0% -> 18.6% -> 20.3%   (x1.09, x1.09)  spread x1.20
 *
 * The first two read as a range at a glance. The third does not: a 20% spread
 * across the whole slider is a control that looks broken, and it cleared an
 * earlier 1.08 floor comfortably. So the floor is set above what that sheet
 * managed rather than below it.
 *
 * Two thresholds, because one is not enough. `MIN_LENGTH_CONTRAST` catches a
 * single step that failed to move — the middle and long rows drawn the same.
 * `MIN_LENGTH_SPREAD` catches the case every step is small but none is flat,
 * which is exactly what afro/coily did and what a per-step floor alone waves
 * through.
 */
export const MIN_LENGTH_CONTRAST = 1.12;

/** How much more hair the longest row must carry than the shortest. */
export const MIN_LENGTH_SPREAD = 1.35;

/**
 * Mean hair coverage per length row, and which rows failed to separate from the
 * one above them.
 *
 * Measured from the coverage `inspectLengthSheet` already computed, so this
 * costs nothing beyond the decode that was happening anyway. Rows are compared
 * to their immediate predecessor rather than to the anchor: a range is only a
 * range if every step is a step.
 */
export function lengthContrast(coverage, lengths, { angles = SHEET_ANGLES } = {}) {
  const rows = lengths.map((length) => {
    const values = angles.map((angle) => coverage[lengthCell(length, angle)]).filter((n) => Number.isFinite(n));
    return values.length ? values.reduce((total, n) => total + n, 0) / values.length : 0;
  });

  const flat = [];
  const ratios = [];
  for (let i = 1; i < rows.length; i += 1) {
    const ratio = rows[i - 1] > 0 ? rows[i] / rows[i - 1] : Infinity;
    ratios.push(ratio);
    if (ratio < MIN_LENGTH_CONTRAST) flat.push(lengths[i]);
  }

  // A range whose every step cleared the floor can still be too small overall.
  // When that happens the whole sheet is the problem rather than one row, so
  // every row after the first is named — the re-roll has to widen all of it.
  const spread = rows[0] > 0 ? rows[rows.length - 1] / rows[0] : Infinity;
  if (spread < MIN_LENGTH_SPREAD) {
    for (const length of lengths.slice(1)) if (!flat.includes(length)) flat.push(length);
  }

  return { rows, ratios, spread, flat };
}

/** `short 12.4%, medium 19.1%, long 28.7% (x1.54, x1.50)` — how a sheet's range reads. */
export function formatContrast(lengths, { rows, ratios, spread }) {
  const parts = lengths.map((length, i) => `${length} ${(rows[i] * 100).toFixed(1)}%`).join(', ');
  const steps = ratios.length ? ` (${ratios.map((r) => `x${r.toFixed(2)}`).join(', ')})` : '';
  const range = Number.isFinite(spread) ? ` spread x${spread.toFixed(2)}` : '';
  return `${parts}${steps}${range}`;
}

/** How a length-sheet panel is named to the model. */
export const lengthPanelLabel = (lengths, cell) => gridLabel(lengthSheet(lengths), cell);

/**
 * The aspect ratio to ask the model for, as `w:h` in lowest terms.
 *
 * Sent rather than left at the `1:1` the four-view sheet uses, because the edit
 * model keeps the input's shape and the composed base is 4 wide by however many
 * lengths tall. Getting this wrong does not fail — it squashes twelve heads into
 * a square and every panel comes back the wrong shape.
 */
export function gridAspect(layout) {
  const divisor = (a, b) => (b ? divisor(b, a % b) : a);
  const d = divisor(layout.cols, layout.rows);
  return `${layout.cols / d}:${layout.rows / d}`;
}

export { ANCHOR_LENGTH };
