#!/usr/bin/env node
/**
 * Cuts the whole app icon set out of `assets/Luvo-icon.png`.
 *
 * The source is an icon *mockup*: the artwork sits on a rounded near-black
 * tile, floated on transparency inside a soft violet-and-pink glow with a lot
 * of padding around it. Shipped as-is, iOS and Android would apply their own
 * corner mask on top of that and the icon would be a shrunken tile inside a
 * halo. So the tile is found, cropped square, and everything outside its
 * rounded silhouette is either filled with the tile's own black (iOS, which
 * masks the corners off itself) or made transparent (splash, favicon, Android).
 *
 * Re-run it whenever the artwork is redrawn — that is the point of it being a
 * script rather than five hand-cut PNGs:
 *
 *   npm run icons
 *
 * Two properties of the artwork are load-bearing, and they are what `findTile`
 * and `subjectBounds` read:
 *
 * - **The tile is the opaque part.** The ground is alpha 0, the glow ramps up
 *   to about 60, and the tile itself lands flat at 252 with a two-pixel edge
 *   between. Everything here separates tile from ground on *alpha*, never on
 *   luminance — the previous artwork was a dark tile on a cream ground, where
 *   luminance was the only signal; this one is dark on dark and luminance
 *   cannot tell the ground from the tile at all.
 * - **The subject is the brightest thing on the tile, and it is not thin.**
 *   Luminance alone is not enough, because the tile's rim highlight is as
 *   bright as the figure. What separates them is width: the rim is a few
 *   pixels of glowing line and the figure is drawn in strokes an order of
 *   magnitude fatter, so `subjectBounds` erodes the bright mask before
 *   measuring it and the rim disappears.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cropImage, decodePng, encodeIco, encodePng, resizeImage } from './lib/png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
/**
 * The website's icons are cut here too, from the same artwork.
 *
 * `web/app/icon.png` and `web/app/apple-icon.png` are Next.js file conventions:
 * dropping them in `app/` is what emits the `<link rel="icon">`. They belong in
 * this script rather than beside the site because they are the *same mark* — a
 * favicon hand-exported once is a favicon that silently stops matching the app
 * the first time the artwork is redrawn, which is the whole reason nothing here
 * is exported by hand.
 */
const webApp = join(root, 'web', 'app');
const SOURCE = join(assets, 'Luvo-icon.png');

/** Alpha at or above this is the tile itself. */
const TILE_ALPHA = 200;
/** Alpha at or below this is the mockup's outer glow, never the tile. */
const GLOW_ALPHA = 60;
/** A pixel is subject rather than tile if it is this much lighter than the tile. */
const SUBJECT_LUM = 100;
/**
 * Erode the bright mask by this many pixels before measuring the subject.
 *
 * The tile's rim highlight is as bright as the figure and hugs the whole
 * boundary, so an un-eroded bounding box is just the tile's. Four passes is
 * measured rather than guessed: the box jumps from the tile edge to the figure
 * between the second and the fourth, and then moves less than ten pixels
 * between the fourth and the fourteenth. The bounds are padded back by the same
 * amount, so the erosion costs nothing but the rim.
 */
const SUBJECT_ERODE = 4;

/**
 * How far inside the tile Android's art layer is bled from — deep enough to
 * clear the artwork's glowing rim, which is a bright line of about 20px on a
 * 962px tile over a soft falloff several times that, and runs wider at the
 * corners. See `bleedGround`.
 */
const RIM_BLEED = 70;
/**
 * ...but never within this of the subject. Eroding past the figure makes the
 * figure itself the bleed's source and smears it out to the canvas edge in a
 * streak you cannot miss — at 90px this artwork grew a pink tail out of the
 * bottom of the icon. The clearance is measured rather than assumed, so an
 * artwork redrawn with the figure closer to the tile's edge quietly gets a
 * shallower bleed instead of a ruined one.
 */
const RIM_GUARD = 8;

/**
 * Android's adaptive mask can crop to a circle inscribed in 66 of the 108dp
 * canvas, so the subject is scaled to sit inside that fraction of the square.
 */
const SAFE_ZONE = 0.66;

/**
 * The monochrome layer's cut: fully transparent at this luminance, fully opaque
 * `SILHOUETTE_RAMP` above it. It reads the flooded square, whose tile tops out
 * around 40, and the figure's darkest stroke — the violet under the jaw — comes
 * in at about 110, so the gap is wide and the floor sits low in it. Set the
 * floor too near the figure and that jaw goes grey rather than white. The ramp
 * is what keeps the hair's edges from stepping.
 */
const SILHOUETTE_FLOOR = 60;
const SILHOUETTE_RAMP = 25;

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** @typedef {{ width: number, height: number, channels: number, colorType: number, pixels: Buffer }} RawImage */

/** @param {RawImage} image */
function pixel(image, x, y) {
  const i = (y * image.width + x) * image.channels;
  return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
}

/** @param {RawImage} image */
function alphaAt(image, x, y) {
  if (image.channels < 4) return 255;
  return image.pixels[(y * image.width + x) * image.channels + 3];
}

/**
 * The tile's bounding box, walked in from the middle of each edge.
 *
 * Scanning from the centre lines rather than over the whole image is what keeps
 * the glow out of it: the glow reaches furthest at the corners, but a mid-row
 * walk meets the tile's flat edge first and stops there.
 */
function findTile(image) {
  const midX = image.width >> 1;
  const midY = image.height >> 1;
  const solid = (x, y) => alphaAt(image, x, y) >= TILE_ALPHA;

  let left = 0;
  while (left < image.width && !solid(left, midY)) left += 1;
  let right = image.width - 1;
  while (right > left && !solid(right, midY)) right -= 1;
  let top = 0;
  while (top < image.height && !solid(midX, top)) top += 1;
  let bottom = image.height - 1;
  while (bottom > top && !solid(midX, bottom)) bottom -= 1;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * A centred square crop, so a tile that came back a few pixels off-square still
 * gives a square icon — plus its coverage: 1 where the tile is, 0 where the
 * mockup's ground shows through.
 *
 * Coverage is the source alpha, rescaled so the glow lands on 0 and the tile on
 * 1. That rescale is the whole job: the glow is a wide, soft halo that would
 * read as a smear around every corner if it were carried into the icon, while
 * the tile's own edge is a two-pixel ramp that has to survive as anti-aliasing.
 * Cutting at a flat threshold would keep the first and destroy the second.
 * Held as a float so it can be area-averaged down into a smooth alpha.
 */
function squareCrop(image, tile) {
  const size = Math.min(tile.width, tile.height);
  const left = Math.round(tile.left + (tile.width - size) / 2);
  const top = Math.round(tile.top + (tile.height - size) / 2);

  const pixels = Buffer.alloc(size * size * 3);
  const coverage = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(image, left + x, top + y);
      const out = (y * size + x) * 3;
      pixels[out] = r;
      pixels[out + 1] = g;
      pixels[out + 2] = b;
      const a = alphaAt(image, left + x, top + y);
      coverage[y * size + x] = Math.min(1, Math.max(0, (a - GLOW_ALPHA) / (TILE_ALPHA - GLOW_ALPHA)));
    }
  }
  return { square: { width: size, height: size, channels: 3, colorType: 2, pixels }, coverage };
}

/** The tile's own black, averaged over the darker half of what the coverage kept. */
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
 * A copy of the square with the ground replaced by the tile's own colour,
 * carried outwards from the nearest kept pixel rather than filled flat.
 *
 * Two reasons it is not a flat fill. Downsampling has to average tile into tile
 * or the ground is pulled inwards as a fringe — that much a flat fill also
 * gets. But the tile is lit, not painted: it runs a couple of levels brighter
 * near its edges than in the middle, and a flat corner against that reads as a
 * patch. Nearest-pixel bleed leaves no seam at any corner radius, which matters
 * because the platforms each choose their own.
 *
 * `inset` is how far inside the tile the bleed starts, and it is the whole
 * difference between the two layers this is called for. At 0 the tile's edge is
 * the source, so the artwork's glowing rim survives into the corners: that is
 * what iOS wants, because iOS masks the corners off at very nearly the radius
 * the artwork was drawn at and the rim is the icon's own edge. Android's art
 * layer is the opposite case — it is full-bleed under a mask the system
 * chooses, so a rim carried outwards draws the tile's outline *inside* the
 * finished icon and you get a rounded square within a rounded square. Bleeding
 * from inside the rim instead carries the tile's dark interior out to the
 * canvas and there is no edge left to see.
 */
function bleedGround(square, coverage, inset) {
  const { width: size } = square;
  const pixels = Buffer.from(square.pixels);
  const done = new Uint8Array(size * size);
  const queue = [];

  // Erode the kept region by `inset` before seeding, so the bleed's source is
  // the tile past its rim rather than the rim itself.
  let kept = new Uint8Array(size * size);
  for (let i = 0; i < coverage.length; i += 1) kept[i] = coverage[i] >= 1 ? 1 : 0;
  for (let pass = 0; pass < inset; pass += 1) {
    const next = new Uint8Array(size * size);
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = y * size + x;
        if (kept[i] && kept[i - 1] && kept[i + 1] && kept[i - size] && kept[i + size]) next[i] = 1;
      }
    }
    kept = next;
  }

  for (let i = 0; i < kept.length; i += 1) if (kept[i]) { done[i] = 1; queue.push(i); }

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

  return { ...square, pixels };
}

/**
 * The subject's bounding box — the bright figure, with the tile's equally
 * bright rim highlight eroded away first.
 *
 * The mask is thresholded on luminance, which catches the figure and the rim
 * together, and then shrunk by `SUBJECT_ERODE` passes of a four-neighbour
 * erosion. The rim is a few pixels of line and does not survive it; the
 * figure's thinnest strand is several times that and barely notices. The box is
 * then grown back by the same margin, so what comes out is the figure's real
 * extent rather than its eroded one.
 */
function subjectBounds(square, coverage) {
  const { width: size, pixels } = square;
  let mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i += 1) {
    if (coverage[i] < 1) continue;
    const p = i * 3;
    if (luminance(pixels[p], pixels[p + 1], pixels[p + 2]) > SUBJECT_LUM) mask[i] = 1;
  }

  for (let pass = 0; pass < SUBJECT_ERODE; pass += 1) {
    const next = new Uint8Array(size * size);
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = y * size + x;
        if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - size] && mask[i + size]) next[i] = 1;
      }
    }
    mask = next;
  }

  let left = size;
  let right = -1;
  let top = size;
  let bottom = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  left = Math.max(0, left - SUBJECT_ERODE);
  top = Math.max(0, top - SUBJECT_ERODE);
  right = Math.min(size - 1, right + SUBJECT_ERODE);
  bottom = Math.min(size - 1, bottom + SUBJECT_ERODE);
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
function adaptiveLayer(square, coverage, subject, size, mode) {
  const artScale = (SAFE_ZONE * size) / Math.max(subject.width, subject.height);
  const source = square.width;
  const step = 1 / artScale; // one output pixel, measured in source pixels
  const subjectCx = subject.left + subject.width / 2;
  const subjectCy = subject.top + subject.height / 2;
  // Output pixel (size/2, size/2) must land on the subject's centre.
  const originX = subjectCx - (size / 2) * step;
  const originY = subjectCy - (size / 2) * step;

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
          a += mode === 'art' ? 1 : coverage[i] * Math.min(1, Math.max(0, (lum - SILHOUETTE_FLOOR) / SILHOUETTE_RAMP));
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

function write(name, image, dir = assets) {
  writeFileSync(join(dir, name), encodePng(image));
  const where = dir === assets ? name : `web/app/${name}`;
  console.log(`  ${where.padEnd(30)} ${image.width}x${image.height} ${image.channels === 4 ? 'RGBA' : 'RGB'}`);
}

/**
 * How far past the tile's rim the browser-tab icon is cropped.
 *
 * A launcher icon is drawn with the figure sitting inside the tile, and both
 * platforms then mask it — so the internal margin is the design. A favicon has
 * no such mask and is seen at 16 CSS pixels, where that margin is most of what
 * you can see: the figure lands in the middle third and the rest is a dark
 * square. Eight per cent off each edge drops the outer glow, which carries no
 * information at that size, and enlarges the figure by about a fifth while
 * leaving the tile's corners still reading as a tile.
 *
 * It is measured rather than chosen: at 16% the head starts to clip and the
 * rounded corner is gone, and at 0% the strands close up into a smudge. Look at
 * the 32px output after any change to the artwork — this is the one number here
 * that is about legibility rather than about geometry.
 */
const WEB_TAB_ZOOM = 0.08;
/**
 * Both website icons at 180px: large enough for an iOS home-screen bookmark,
 * which is the biggest thing that asks for either, and small enough that the
 * browser downscaling to 16 or 32 has plenty to work with.
 */
const WEB_ICON_SIZE = 180;

const source = decodePng(readFileSync(SOURCE));
const tile = findTile(source);
const { square, coverage } = squareCrop(source, tile);
const black = tileBlack(square, coverage);
const subject = subjectBounds(square, coverage);
const clearance = Math.min(
  subject.left,
  subject.top,
  square.width - (subject.left + subject.width),
  square.width - (subject.top + subject.height),
);
const bleed = Math.max(0, Math.min(RIM_BLEED, clearance - RIM_GUARD));
// The artwork's edge, kept for iOS and cut away for Android. See `bleedGround`.
const edged = bleedGround(square, coverage, 0);
const flooded = bleedGround(square, coverage, bleed);

const hex = `#${black.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
console.log(`source   ${source.width}x${source.height}`);
console.log(`  tile     ${tile.width}x${tile.height} at ${tile.left},${tile.top} — square ${square.width}px, black ${hex}`);
console.log(`  subject  ${subject.width}x${subject.height} at ${subject.left},${subject.top} — ${clearance}px clear of the tile`);
console.log(`  bleed    ${bleed}px${bleed < RIM_BLEED ? ` (clamped from ${RIM_BLEED} to stay off the subject)` : ''}`);
console.log('writing:');

// iOS and the stores want a full-bleed square: the platform rounds the corners
// itself, so the tile's own corners are filled rather than cut out.
write('icon.png', toRgb(downsample(edged, coverage, 1024)));
// Splash and favicon are composited onto something, so they keep the silhouette.
write('splash-icon.png', toRgba(downsample(edged, coverage, 1024)));
write('favicon.png', toRgba(downsample(edged, coverage, 48)));
write('android-icon-foreground.png', adaptiveLayer(flooded, coverage, subject, 512, 'art'));
// The monochrome layer takes the flooded square too: its canvas is the tile at
// about 85%, so a kept rim would print the tile's outline into the silhouette
// alongside the figure, and a themed icon is supposed to be the figure alone.
write('android-icon-monochrome.png', adaptiveLayer(flooded, coverage, subject, 432, 'silhouette'));

// The website, from the same square. Both are opaque and full-bleed for the
// reason `icon.png` is: a browser draws the tab icon on its own chrome and iOS
// masks a bookmarked one itself, so the tile's corners are filled rather than
// cut out. Only the tab icon is zoomed — see `WEB_TAB_ZOOM`.
const appIcon = toRgb(downsample(edged, coverage, 1024));
const webInset = Math.round(appIcon.width * WEB_TAB_ZOOM);
write(
  'icon.png',
  resizeImage(
    cropImage(appIcon, webInset, webInset, appIcon.width - webInset * 2, appIcon.height - webInset * 2),
    WEB_ICON_SIZE,
  ),
  webApp,
);
write('apple-icon.png', resizeImage(appIcon, WEB_ICON_SIZE), webApp);

/**
 * `web/app/favicon.ico`, which is the one output here that is about a *search
 * result* rather than about a device.
 *
 * Next already emits a `<link rel="icon">` for `app/icon.png`, and that is what
 * fills a browser tab. It was not enough for Google, whose listing for the site
 * drew a grey globe: the crawler's favicon pass looks for the well-known path
 * first, and `/favicon.ico` was a 404 — Next serves the PNG from a
 * content-hashed url instead. This file is the well-known path, and it is the
 * whole fix.
 *
 * The sizes are not a hedge. 16 and 32 are what a tab and a bookmark bar ask
 * for; 48 is there because Google's own guidance is a square that is a multiple
 * of 48, and it is the one that gets downscaled into a result. All three are cut
 * from the same zoomed square the tab icon uses — see `WEB_TAB_ZOOM`, which is
 * the reason the figure is legible at 16 at all.
 */
const favicon = cropImage(
  appIcon,
  webInset,
  webInset,
  appIcon.width - webInset * 2,
  appIcon.height - webInset * 2,
);
const icoSizes = [16, 32, 48];
writeFileSync(
  join(webApp, 'favicon.ico'),
  encodeIco(icoSizes.map((size) => ({ size, png: encodePng(opaqueRgba(shrink(favicon, size))) }))),
);
console.log(`  ${'favicon.ico'.padEnd(30)} ${icoSizes.join('/')} RGBA`);

/**
 * The same pixels with a fully opaque alpha channel bolted on.
 *
 * The tile is opaque, so this adds no information — and it is not optional.
 * Next decodes `app/favicon.ico` at build time to emit its metadata, through a
 * Rust decoder that **rejects a PNG-in-ICO entry that is not RGBA**: an RGB one
 * fails the build outright with "The PNG is not in RGBA format!". The directory
 * entries this file writes already declare 32 bits per pixel, so this is also
 * what makes the container describe its own contents honestly.
 */
function opaqueRgba(image) {
  if (image.channels === 4) return image;
  const pixels = Buffer.alloc(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i += 1) {
    pixels[i * 4] = image.pixels[i * image.channels];
    pixels[i * 4 + 1] = image.pixels[i * image.channels + 1];
    pixels[i * 4 + 2] = image.pixels[i * image.channels + 2];
    pixels[i * 4 + 3] = 255;
  }
  return { width: image.width, height: image.height, channels: 4, colorType: 6, pixels };
}

/**
 * A large reduction, done by halving rather than in one step.
 *
 * `resizeImage` is bilinear, which reads four source pixels per output pixel.
 * That is right for the modest reductions everything else here asks of it and
 * badly wrong at these sizes: 884px down to 16 means each output pixel is
 * decided by four of the roughly three thousand under it, and every other one is
 * simply not looked at. The mark is a figure drawn in thin strokes on black, so
 * what comes back is not a soft 16px icon — it is a scatter of whichever pixels
 * happened to fall on a sample point, and it looks like a corrupted file.
 *
 * Halving repeatedly fixes it because at exactly half scale bilinear *is* an
 * average of the four pixels being merged, so nothing is skipped: each pass
 * folds the whole image into the next one down. The last step lands on the
 * requested size from within a factor of two, where bilinear is honest again.
 */
function shrink(image, size) {
  let current = image;
  while (current.width >= size * 2) {
    current = resizeImage(current, Math.max(size, Math.round(current.width / 2)));
  }
  return resizeImage(current, size);
}

console.log(`\nandroid.adaptiveIcon.backgroundColor should be ${hex}`);
