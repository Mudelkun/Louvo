/**
 * Finds the hair in a mannequin render — or, put the other way round, finds the
 * mannequin, because everything that is not the mannequin and not the backdrop
 * is hair.
 *
 * This exists so the app's colour grade lands on the haircut and nothing else.
 * The grade is a per-channel map anchored at white (`src/lib/colorGrade.ts`), so
 * on white plastic and a white background it is nearly a no-op — but "nearly" is
 * still a faint tint on the head, and it is exactly wrong on the one dark thing
 * that is not hair: the shadow under the jaw. A mask removes the question.
 *
 * The house style makes this tractable without a model. Every render is the same
 * matte white head on flat white, lit high-key, with espresso hair; measured
 * across the catalog the backdrop is #FCFCFC and 90% of hair pixels sit below
 * luma 89, while the plastic's own shadows bottom out around #D4D1CD (212). So
 * the three regions separate on luminance — but luminance alone mislabels two
 * things, and both are fixed by looking at regions rather than pixels:
 *
 *   - a specular strand inside the hair mass is bright, but it is sealed inside
 *     hair, so it is hair;
 *   - the shadow under the jaw is dark, but it is sealed inside plastic, so it
 *     is mannequin.
 *
 * The output is a greyscale mask, white where hair is, with a soft edge so a
 * curl does not come back aliased.
 */

import { blankImage } from './png.mjs';

/** Above this, and reachable from the frame edge, is the white backdrop. */
const BACKDROP_LUMA = 232;
/** Above this, inside the subject, is confidently lit mannequin plastic. */
const PLASTIC_LUMA = 196;
/**
 * How far down into shading the plastic region is allowed to grow. Below the
 * plastic's own darkest shadows but above nearly all hair, so the flood crosses
 * the shading under the jaw without leaking into the haircut.
 */
const SHADOW_GATE = 132;
/** Luma at which a pixel is fully hair, and the luma at which it is fully not. */
const HAIR_FULL = 110;
const HAIR_NONE = 176;
/** A lit region smaller than this fraction of the frame is a highlight, not the head. */
const MIN_PLASTIC_AREA = 0.003;
/** A dark region smaller than this, with no route to open air, is shading. */
const MIN_HAIR_AREA = 0.004;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Rec. 709 luma, the same measure the sheet inspector and the tone script use. */
function lumaOf(image) {
  const { width, height, channels, pixels } = image;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const o = i * channels;
    const r = pixels[o];
    const g = channels > 2 ? pixels[o + 1] : r;
    const b = channels > 2 ? pixels[o + 2] : r;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return luma;
}

/**
 * Four-connected flood fill. `seed` says where to start, `gate` says where the
 * fill may spread; a pixel has to pass `gate` either way.
 */
function flood(width, height, seed, gate) {
  const filled = new Uint8Array(width * height);
  const stack = [];
  const push = (i) => {
    if (!filled[i] && gate(i)) {
      filled[i] = 1;
      stack.push(i);
    }
  };

  for (let i = 0; i < filled.length; i += 1) if (seed(i)) push(i);

  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  return filled;
}

/** Labels the four-connected regions of `member`, with each region's area. */
function components(width, height, member) {
  const label = new Int32Array(member.length).fill(-1);
  const areas = [];

  for (let start = 0; start < member.length; start += 1) {
    if (!member[start] || label[start] >= 0) continue;
    const id = areas.length;
    label[start] = id;
    let area = 0;
    const stack = [start];

    while (stack.length) {
      const i = stack.pop();
      area += 1;
      const x = i % width;
      const y = (i / width) | 0;
      const neighbours = [];
      if (x > 0) neighbours.push(i - 1);
      if (x < width - 1) neighbours.push(i + 1);
      if (y > 0) neighbours.push(i - width);
      if (y < height - 1) neighbours.push(i + width);
      for (const j of neighbours) {
        if (member[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    areas.push(area);
  }
  return { label, areas };
}

/**
 * @param {import('./png.mjs').RawImage} image a mannequin render
 * @returns {{ mask: import('./png.mjs').RawImage, coverage: number, highlights: number, shadows: number }}
 *   `mask` is 8-bit greyscale, 255 where hair is; `coverage` is the fraction of
 *   the frame it covers, and the two counts are the regions region-reasoning
 *   rescued (bright, inside hair) and rejected (dark, inside plastic).
 */
export function hairMask(image) {
  const { width, height } = image;
  const n = width * height;
  const luma = lumaOf(image);

  // 1. The backdrop: white, and reachable from the edge of the frame. Reachable
  //    matters — a white highlight on the head is the same colour and is not it.
  const backdrop = flood(
    width,
    height,
    (i) => {
      const x = i % width;
      const y = (i / width) | 0;
      return (x === 0 || y === 0 || x === width - 1 || y === height - 1) && luma[i] > BACKDROP_LUMA;
    },
    (i) => luma[i] > BACKDROP_LUMA,
  );

  // 2. The mannequin: start from the large lit regions of plastic — the face and
  //    the display base — and grow them down into their own shading, so the dark
  //    crescent under the jaw ends up mannequin rather than hair. Small lit
  //    regions are dropped here: those are glints on the hair itself.
  const lit = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) lit[i] = !backdrop[i] && luma[i] > PLASTIC_LUMA ? 1 : 0;

  const litParts = components(width, height, lit);
  const isHead = litParts.areas.map((area) => area >= MIN_PLASTIC_AREA * n);
  const plastic = flood(
    width,
    height,
    (i) => lit[i] === 1 && isHead[litParts.label[i]],
    (i) => !backdrop[i] && luma[i] > SHADOW_GATE,
  );

  // 3. Hair is the rest, softened at the edges so a curl keeps its silhouette.
  const alpha = new Float32Array(n);
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (backdrop[i] || plastic[i]) continue;
    alpha[i] = clamp01((HAIR_NONE - luma[i]) / (HAIR_NONE - HAIR_FULL));
    if (alpha[i] > 0) solid[i] = 1;
  }

  // 4. ...but only where it is really hair. A region that touches open air is
  //    hair however small it is (a loose strand, a tendril in front of the ear);
  //    a small region sealed inside the plastic is shading on the head.
  const hairParts = components(width, height, solid);
  const touchesAir = new Uint8Array(hairParts.areas.length);
  for (let i = 0; i < n; i += 1) {
    const id = hairParts.label[i];
    if (id < 0 || touchesAir[id]) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      touchesAir[id] = 1;
      continue;
    }
    if (backdrop[i - 1] || backdrop[i + 1] || backdrop[i - width] || backdrop[i + width]) touchesAir[id] = 1;
  }
  const isHair = hairParts.areas.map((area, id) => !!touchesAir[id] || area >= MIN_HAIR_AREA * n);

  const mask = blankImage(width, height, 1, 0, 0);
  let covered = 0;
  for (let i = 0; i < n; i += 1) {
    const id = hairParts.label[i];
    const a = id >= 0 && isHair[id] ? alpha[i] : 0;
    if (a > 0.5) covered += 1;
    mask.pixels[i] = Math.round(a * 255);
  }

  return {
    mask,
    coverage: covered / n,
    highlights: isHead.filter((keep) => !keep).length,
    shadows: isHair.filter((keep) => !keep).length,
  };
}

/**
 * Coverage outside this band means the mask is not describing a haircut — an
 * empty mask, or one that has swallowed the head. Both are worth a warning
 * rather than silently shipping a mannequin that recolours.
 */
export const COVERAGE_FLOOR = 0.02;
export const COVERAGE_CEILING = 0.85;
