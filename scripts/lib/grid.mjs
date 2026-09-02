/**
 * The arithmetic every generated contact grid needs: where a panel sits, how to
 * cut it out, and how much of it is hair.
 *
 * Two grids are generated in this project and they are deliberately not the same
 * thing — `lib/sheet.mjs` is one haircut from four camera angles, `lib/hairTypeSheet.mjs`
 * is four hair types on one head — but the crop maths and the "is there any hair
 * in this quadrant" measurement are identical, and both have to agree with the
 * layout the prompt described in words. So the layout is a value passed in, and
 * nothing here knows what a panel means.
 *
 * A layout is `{ cols, rows, cells, positions }`: `cells` are the panel ids in
 * reading order (left to right, top to bottom) and `positions` are the names the
 * prompt calls them by, in the same order.
 */

import { cropImage, decodePng } from './png.mjs';

/** Where one panel sits, as a fraction of the whole image. */
export function gridRect(layout, cell) {
  const index = indexOf(layout, cell);
  return {
    x: (index % layout.cols) / layout.cols,
    y: Math.floor(index / layout.cols) / layout.rows,
    width: 1 / layout.cols,
    height: 1 / layout.rows,
  };
}

/** How a panel is named to the model — "Top-left" and friends. */
export function gridLabel(layout, cell) {
  return layout.positions[indexOf(layout, cell)];
}

function indexOf(layout, cell) {
  const index = layout.cells.indexOf(cell);
  if (index < 0) throw new Error(`"${cell}" is not a panel on this grid`);
  return index;
}

/** One panel out of a decoded image, with the crop that produced it. */
export function panelOf(image, layout, cell, inset = 0) {
  const rect = gridRect(layout, cell);
  const crop = {
    x: Math.round(rect.x * image.width + inset),
    y: Math.round(rect.y * image.height + inset),
    width: Math.round(rect.width * image.width - inset * 2),
    height: Math.round(rect.height * image.height - inset * 2),
  };
  return { crop, image: cropImage(image, crop.x, crop.y, crop.width, crop.height) };
}

/**
 * Cuts a generated image into one decoded panel per cell.
 *
 * `inset` trims that many pixels off every panel edge. It defaults to 0 — the
 * prompts ask for panels that meet edge to edge — and exists for the run where
 * the model draws a hairline divider anyway, so a grid can be re-cut (free)
 * instead of regenerated.
 *
 * @returns {{ cell: string, image: import('./png.mjs').RawImage, crop: object }[]}
 */
export function sliceGrid(buffer, layout, { cells = layout.cells, inset = 0, minPanel = 64 } = {}) {
  const image = decodePng(buffer);
  const panelWidth = image.width / layout.cols;
  const panelHeight = image.height / layout.rows;

  if (panelWidth < minPanel || panelHeight < minPanel) {
    throw new Error(`grid is only ${image.width}x${image.height} — panels would be unusably small`);
  }

  return cells.map((cell) => {
    const panel = panelOf(image, layout, cell, inset);
    return { cell, image: panel.image, crop: panel.crop };
  });
}

/**
 * Luminance below which a pixel is hair rather than mannequin.
 *
 * The material is matte white with shadows bottoming out around #D4D1CD (212),
 * and the hair in every generated image is espresso brown (#33231B, luma 40).
 * 150 sits in the gap: dark enough that no amount of shading under a jaw counts
 * as hair, light enough to catch the soft edge of a fade.
 */
export const HAIR_LUMA = 150;

/** Fraction of a panel's opaque pixels that are hair-dark. */
export function hairCoverage(image) {
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

/** `front 0.6%, side 0.5%` — coverage as it is printed in a warning. */
export function formatCoverage(coverage, cells = Object.keys(coverage)) {
  return cells.map((cell) => `${cell} ${(coverage[cell] * 100).toFixed(1)}%`).join(', ');
}
