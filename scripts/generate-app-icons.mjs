#!/usr/bin/env node
/**
 * Cuts the whole app icon set out of `assets/Hairify - icon.png`.
 *
 * The source is an icon *mockup*: the artwork sits on a rounded black tile,
 * photographed with a drop shadow on a cream ground. Shipped as-is, iOS and
 * Android would apply their own corner mask on top of that and the icon would
 * be a shrunken tile floating inside a pale border with a shadow baked into it.
 * So the tile is found, cropped square, and everything outside its rounded
 * silhouette is either filled with the tile's own black (iOS, which masks the
 * corners off itself) or made transparent (splash, favicon, Android).
 *
 * Re-run it whenever the artwork is redrawn — that is the point of it being a
 * script rather than five hand-cut PNGs:
 *
 *   npm run icons
 *
 * The one thing it needs from the artwork is the house style it already has: a
 * dark tile on a light ground, with the subject in a warm tone. Change that and
 * `findTile` and `goldBounds` are what break first.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, encodePng } from './lib/png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const SOURCE = join(assets, 'Hairify - icon.png');

/** Anything above this luminance is the mockup's ground or its drop shadow, never the tile. */
const GROUND_LUM = 70;
/** Grow the ground inwards by this much, to swallow the tile's anti-aliased rim. */
const RIM = 2;
/** A pixel is subject rather than tile if it is both light and warm. */
const SUBJECT_LUM = 80;
const SUBJECT_WARMTH = 30;

/**
 * Android's adaptive mask can crop to a circle inscribed in 66 of the 108dp
 * canvas, so the subject is scaled to sit inside that fraction of the square.
 */
const SAFE_ZONE = 0.66;

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** @typedef {{ width: number, height: number, channels: number, colorType: number, pixels: Buffer }} RawImage */

/** @param {RawImage} image */
function pixel(image, x, y) {
  const i = (y * image.width + x) * image.channels;
  return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
}

/**
 * The tile's bounding box, walked in from the middle of each edge.
 *
 * Scanning from the centre lines rather than over the whole image is what keeps
 * the drop shadow out of it: the shadow is lighter than the tile everywhere,
 * but it is only *below* the tile, so a mid-row walk meets the tile first.
 */
function findTile(image) {
  const midX = image.width >> 1;
  const midY = image.height >> 1;
  const dark = (x, y) => luminance(...pixel(image, x, y)) <= GROUND_LUM;

  let left = 0;
  while (left < image.width && !dark(left, midY)) left += 1;
  let right = image.width - 1;
  while (right > left && !dark(right, midY)) right -= 1;
  let top = 0;
  while (top < image.height && !dark(midX, top)) top += 1;
  let bottom = image.height - 1;
  while (bottom > top && !dark(midX, bottom)) bottom -= 1;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** A centred square crop, so a tile that came back a few pixels off-square still gives a square icon. */
function squareCrop(image, tile) {
  const size = Math.min(tile.width, tile.height);
  const left = Math.round(tile.left + (tile.width - size) / 2);
  const top = Math.round(tile.top + (tile.height - size) / 2);

  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(image, left + x, top + y);
      const out = (y * size + x) * 3;
      pixels[out] = r;
      pixels[out + 1] = g;
      pixels[out + 2] = b;
    }
  }
  return { width: size, height: size, channels: 3, colorType: 2, pixels };
}

/**
 * Coverage: 1 where the tile is, 0 where the mockup's ground shows through.
 *
 * Flood-filled from the four corners rather than thresholded, because the
 * subject is lighter than the ground threshold too — the ground is only ground
 * by virtue of being *outside* the tile, and the tile's black separates the two
 * everywhere. Held as a float so it can be area-averaged down into a smooth
 * alpha rather than resampled from a hard edge.
 */
function tileCoverage(square) {
  const { width: size, pixels } = square;
  const outside = new Uint8Array(size * size);
  const queue = [0, size - 1, size * (size - 1), size * size - 1];

  const light = (index) => {
    const i = index * 3;
    return luminance(pixels[i], pixels[i + 1], pixels[i + 2]) > GROUND_LUM;
  };

  for (const seed of queue) if (light(seed)) outside[seed] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    if (!outside[index]) continue;
    const x = index % size;
    const y = (index / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (outside[next] || !light(next)) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }

  // Grow it inwards: the ring where ground and tile blend is neither, and left
  // in place it reads as a pale halo around every rounded corner.
  for (let pass = 0; pass < RIM; pass += 1) {
    const grown = outside.slice();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (outside[y * size + x]) continue;
        const near =
          (x > 0 && outside[y * size + x - 1]) ||
          (x < size - 1 && outside[y * size + x + 1]) ||
          (y > 0 && outside[(y - 1) * size + x]) ||
          (y < size - 1 && outside[(y + 1) * size + x]);
        if (near) grown[y * size + x] = 1;
      }
    }
    outside.set(grown);
  }

  const coverage = new Float32Array(size * size);
  for (let i = 0; i < coverage.length; i += 1) coverage[i] = outside[i] ? 0 : 1;
  return coverage;
}

/** The tile's own black, averaged over what the flood fill left dark. */
function tileBlack(square, coverage) {
  const { pixels } = square;
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < coverage.length; i += 1) {
    if (!coverage[i]) continue;
    const p = i * 3;
    if (luminance(pixels[p], pixels[p + 1], pixels[p + 2]) > 50) continue;
    r += pixels[p];
    g += pixels[p + 1];
    b += pixels[p + 2];
    n += 1;
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
}

/**
 * Replaces the ground with the tile's own colour, carried outwards from the
 * nearest tile pixel rather than filled flat.
 *
 * Two reasons it is not a flat fill. Downsampling has to average tile into tile
 * or the cream is pulled inwards as a pale fringe — that much a flat fill also
 * gets. But the tile is lit, not painted: it runs a couple of levels brighter at
 * the top-left than at the bottom-right, and a flat corner against that reads as
 * a patch. Nearest-pixel bleed leaves no seam at any corner radius, which
 * matters because the platforms each choose their own.
 */
function bleedGround(square, coverage) {
  const { width: size, pixels } = square;
  const done = new Uint8Array(size * size);
  const queue = [];

  for (let i = 0; i < coverage.length; i += 1) if (coverage[i]) { done[i] = 1; queue.push(i); }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % size;
    const y = (index / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (done[next]) continue;
      done[next] = 1;
      pixels.copy(pixels, next * 3, index * 3, index * 3 + 3);
      queue.push(next);
    }
  }
}

/** The subject's bounding box — light and warm, which the tile is not. */
function goldBounds(square) {
  const { width: size, pixels } = square;
  let left = size;
  let right = -1;
  let top = size;
  let bottom = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 3;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (luminance(r, g, b) <= SUBJECT_LUM || r - b <= SUBJECT_WARMTH) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Area-average downsample of the square plus its coverage, in one pass.
 *
 * `resizeImage` in lib/png.mjs is bilinear, which is right for the small ratios
 * a mannequin sheet needs and wrong here: a 1135px tile going to a 48px favicon
 * skips 23 pixels out of every 24 and the hair comes back as speckle.
 */
function downsample(square, coverage, size) {
  const scale = square.width / size;
  const rgb = new Float32Array(size * size * 3);
  const alpha = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = sy * square.width + sx;
          const p = i * 3;
          r += square.pixels[p];
          g += square.pixels[p + 1];
          b += square.pixels[p + 2];
          a += coverage[i];
          n += 1;
        }
      }
      const out = (y * size + x) * 3;
      rgb[out] = r / n;
      rgb[out + 1] = g / n;
      rgb[out + 2] = b / n;
      alpha[y * size + x] = a / n;
    }
  }
  return { rgb, alpha, size };
}

/** @returns {RawImage} */
function toRgb(small) {
  const pixels = Buffer.alloc(small.size * small.size * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = Math.round(small.rgb[i]);
  return { width: small.size, height: small.size, channels: 3, colorType: 2, pixels };
}

/** @returns {RawImage} */
function toRgba(small) {
  const pixels = Buffer.alloc(small.size * small.size * 4);
  for (let i = 0; i < small.size * small.size; i += 1) {
    pixels[i * 4] = Math.round(small.rgb[i * 3]);
    pixels[i * 4 + 1] = Math.round(small.rgb[i * 3 + 1]);
    pixels[i * 4 + 2] = Math.round(small.rgb[i * 3 + 2]);
    pixels[i * 4 + 3] = Math.round(small.alpha[i] * 255);
  }
  return { width: small.size, height: small.size, channels: 4, colorType: 6, pixels };
}

/**
 * The adaptive-icon layers: the square art (or its silhouette) scaled so the
 * *subject* fills the safe zone, centred on the subject rather than on the
 * tile — the artwork sits right of centre inside its own tile, and an adaptive
 * icon is cropped around the canvas centre.
 *
 * The art layer is **full-bleed and fully opaque**, and that is the whole
 * reason it samples with clamped coordinates: fitting the subject into the safe
 * zone leaves the tile covering only about four fifths of the canvas, and the
 * first version padded the rest with transparency over a flat `backgroundColor`
 * of the tile's measured black. The tile is lit rather than painted, so its own
 * black is a level or two off that flat one — which drew a rounded square
 * *inside* the icon, faint and unmistakable. Clamping carries the tile's edge
 * out to the canvas instead, and nothing shows through.
 *
 * @param {'art' | 'silhouette'} mode
 */
function adaptiveLayer(square, coverage, gold, size, mode) {
  const artScale = (SAFE_ZONE * size) / Math.max(gold.width, gold.height);
  const source = square.width;
  const step = 1 / artScale; // one output pixel, measured in source pixels
  const goldCx = gold.left + gold.width / 2;
  const goldCy = gold.top + gold.height / 2;
  // Output pixel (size/2, size/2) must land on the subject's centre.
  const originX = goldCx - (size / 2) * step;
  const originY = goldCy - (size / 2) * step;

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sy0 = Math.floor(originY + y * step);
    const sy1 = Math.max(sy0 + 1, Math.floor(originY + (y + 1) * step));
    for (let x = 0; x < size; x += 1) {
      const sx0 = Math.floor(originX + x * step);
      const sx1 = Math.max(sx0 + 1, Math.floor(originX + (x + 1) * step));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        const cy = Math.min(source - 1, Math.max(0, sy));
        for (let sx = sx0; sx < sx1; sx += 1) {
          const cx = Math.min(source - 1, Math.max(0, sx));
          const i = cy * source + cx;
          const p = i * 3;
          const lum = luminance(square.pixels[p], square.pixels[p + 1], square.pixels[p + 2]);
          r += square.pixels[p];
          g += square.pixels[p + 1];
          b += square.pixels[p + 2];
          // The art layer is the tile itself, edge to edge; the silhouette is
          // the subject cut out of it, ramped over the tone gap between tile and
          // subject so the hair keeps its edges instead of stepping.
          a += mode === 'art' ? 1 : coverage[i] * Math.min(1, Math.max(0, (lum - 50) / 45));
          n += 1;
        }
      }
      if (!n) continue;
      const out = (y * size + x) * 4;
      if (mode === 'silhouette') {
        pixels[out] = 255;
        pixels[out + 1] = 255;
        pixels[out + 2] = 255;
      } else {
        pixels[out] = Math.round(r / n);
        pixels[out + 1] = Math.round(g / n);
        pixels[out + 2] = Math.round(b / n);
      }
      pixels[out + 3] = Math.round(Math.min(1, a / n) * 255);
    }
  }
  return { width: size, height: size, channels: 4, colorType: 6, pixels };
}

function write(name, image) {
  writeFileSync(join(assets, name), encodePng(image));
  console.log(`  ${name.padEnd(30)} ${image.width}x${image.height} ${image.channels === 4 ? 'RGBA' : 'RGB'}`);
}

const source = decodePng(readFileSync(SOURCE));
const tile = findTile(source);
const square = squareCrop(source, tile);
const coverage = tileCoverage(square);
const black = tileBlack(square, coverage);
bleedGround(square, coverage);
const gold = goldBounds(square);

const hex = `#${black.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
console.log(`source   ${source.width}x${source.height}`);
console.log(`  tile     ${tile.width}x${tile.height} at ${tile.left},${tile.top} — square ${square.width}px, black ${hex}`);
console.log(`  subject  ${gold.width}x${gold.height} at ${gold.left},${gold.top}`);
console.log('writing:');

// iOS and the stores want a full-bleed square: the platform rounds the corners
// itself, so the tile's own corners are filled rather than cut out.
write('icon.png', toRgb(downsample(square, coverage, 1024)));
// Splash and favicon are composited onto something, so they keep the silhouette.
write('splash-icon.png', toRgba(downsample(square, coverage, 1024)));
write('favicon.png', toRgba(downsample(square, coverage, 48)));
write('android-icon-foreground.png', adaptiveLayer(square, coverage, gold, 512, 'art'));
write('android-icon-monochrome.png', adaptiveLayer(square, coverage, gold, 432, 'silhouette'));

console.log(`\nandroid.adaptiveIcon.backgroundColor should be ${hex}`);
