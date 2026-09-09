/**
 * Minimal PNG decode / crop / encode — no dependencies.
 *
 * Exists so a four-view sheet can be built from approved base heads locally and
 * cut back into its four panels after generation. That is the whole job: read the
 * pixels, take or place a rectangle, write it back out. Anything fancier
 * (resizing, colour management) is not needed here and deliberately absent.
 *
 * Supports the 8-bit non-interlaced greyscale/RGB/RGBA images image models
 * actually return, and throws a clear error on anything else rather than
 * silently producing garbage.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels per pixel for each PNG colour type. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Paeth predictor, straight from the PNG spec. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @typedef {{ width: number, height: number, channels: number, colorType: number, pixels: Buffer }} RawImage
 */

/** @returns {RawImage} */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG (bad signature)');

  let header = null;
  const idat = [];

  for (let pos = 8; pos + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + length;
  }

  if (!header) throw new Error('PNG has no IHDR chunk');
  if (header.bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${header.bitDepth} (expected 8)`);
  if (header.interlace !== 0) throw new Error('unsupported interlaced PNG');
  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`);

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is truncated');

  // Undo the per-scanline filters in place: every filter is defined against the
  // already-reconstructed bytes to the left and on the row above.
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prior = out - stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[out + x - channels] : 0;
      const up = y > 0 ? pixels[prior + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prior + x - channels] : 0;
      const value = line[x];

      switch (filter) {
        case 0: pixels[out + x] = value; break;
        case 1: pixels[out + x] = (value + left) & 0xff; break;
        case 2: pixels[out + x] = (value + up) & 0xff; break;
        case 3: pixels[out + x] = (value + ((left + up) >> 1)) & 0xff; break;
        case 4: pixels[out + x] = (value + paeth(left, up, upLeft)) & 0xff; break;
        default: throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
    }
  }

  return { width, height, channels, colorType: header.colorType, pixels };
}

/**
 * Copies a rectangle out of a decoded image. The rectangle is clamped to the
 * image, so a panel that lands a pixel over the edge still crops cleanly.
 *
 * @param {RawImage} image
 * @returns {RawImage}
 */
export function cropImage(image, x, y, width, height) {
  const left = Math.max(0, Math.min(image.width, Math.round(x)));
  const top = Math.max(0, Math.min(image.height, Math.round(y)));
  const right = Math.max(left, Math.min(image.width, Math.round(x + width)));
  const bottom = Math.max(top, Math.min(image.height, Math.round(y + height)));

  const outWidth = right - left;
  const outHeight = bottom - top;
  if (!outWidth || !outHeight) throw new Error(`crop ${x},${y} ${width}x${height} falls outside the image`);

  const { channels } = image;
  const pixels = Buffer.alloc(outWidth * outHeight * channels);
  for (let row = 0; row < outHeight; row += 1) {
    const from = ((top + row) * image.width + left) * channels;
    image.pixels.copy(pixels, row * outWidth * channels, from, from + outWidth * channels);
  }

  return { width: outWidth, height: outHeight, channels, colorType: image.colorType, pixels };
}

/**
 * Bilinear resize.
 *
 * Needed because base heads do not all arrive at the same size — a head cut out
 * of an earlier sheet is half the resolution of one generated on its own — and a
 * sheet whose panels are different scales is worse than useless. Cropping to fit
 * would cut the head off, so the pixels get resampled.
 *
 * @param {RawImage} image
 * @returns {RawImage}
 */
export function resizeImage(image, width, height = width) {
  if (image.width === width && image.height === height) return image;

  const { channels } = image;
  const pixels = Buffer.alloc(width * height * channels);
  const scaleX = image.width / width;
  const scaleY = image.height / height;

  for (let y = 0; y < height; y += 1) {
    // Sample at pixel centres, so the output is not shifted by half a pixel.
    const sourceY = Math.min(image.height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = sourceY - y0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = sourceX - x0;

      const topLeft = (y0 * image.width + x0) * channels;
      const topRight = (y0 * image.width + x1) * channels;
      const bottomLeft = (y1 * image.width + x0) * channels;
      const bottomRight = (y1 * image.width + x1) * channels;
      const out = (y * width + x) * channels;

      for (let c = 0; c < channels; c += 1) {
        const top = image.pixels[topLeft + c] * (1 - fx) + image.pixels[topRight + c] * fx;
        const bottom = image.pixels[bottomLeft + c] * (1 - fx) + image.pixels[bottomRight + c] * fx;
        pixels[out + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }

  return { width, height, channels, colorType: image.colorType, pixels };
}

/**
 * Creates a blank image, used as the canvas a sheet is tiled onto.
 *
 * @param {number} fill  byte written to every channel — 0xFF is the white the
 *                       house style calls for, so an unfilled panel is invisible
 *                       rather than a black hole.
 * @returns {RawImage}
 */
export function blankImage(width, height, channels, colorType, fill = 0xff) {
  return { width, height, channels, colorType, pixels: Buffer.alloc(width * height * channels, fill) };
}

/**
 * Draws `source` into `target` at (x, y). Mutates `target`.
 *
 * @param {RawImage} target
 * @param {RawImage} source
 */
export function pasteImage(target, source, x, y) {
  if (source.channels !== target.channels) {
    throw new Error(`cannot paste a ${source.channels}-channel image into a ${target.channels}-channel one`);
  }

  const left = Math.round(x);
  const top = Math.round(y);
  const width = Math.min(source.width, target.width - left);
  const height = Math.min(source.height, target.height - top);
  if (width <= 0 || height <= 0) throw new Error(`paste at ${x},${y} falls outside the target image`);

  const { channels } = target;
  for (let row = 0; row < height; row += 1) {
    const from = row * source.width * channels;
    const to = ((top + row) * target.width + left) * channels;
    source.pixels.copy(target.pixels, to, from, from + width * channels);
  }
  return target;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @param {RawImage} image */
export function encodePng(image) {
  const { width, height, channels, colorType, pixels } = image;
  const stride = width * channels;

  // Filter type 0 (none) on every row: these are crops of an already-compressed
  // photo, so the extra CPU of filter selection buys very little.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A Windows `.ico` container holding one or more PNGs.
 *
 * It exists for exactly one output — `web/app/favicon.ico`, which is the file
 * Google fetches when it decides which picture to draw beside a search result.
 * A `<link rel="icon">` alone is not reliably enough: Next serves that one from
 * a content-hashed url, and a favicon Google cannot find at the well-known path
 * is a favicon Google replaces with a grey globe.
 *
 * The entries carry PNG payloads rather than the format's original BMP ones.
 * That is legal in the ICO container and every browser released since Vista
 * reads it, which is why nothing here has to encode a bottom-up bitmap with a
 * separate AND mask. Several sizes go in one file because the consumers ask for
 * different ones — a browser tab wants 16 or 32 and Google wants a multiple of
 * 48 — and picking wrong is the difference between a sharp mark and a smudge.
 *
 * @param {{ size: number, png: Buffer }[]} entries smallest first
 */
export function encodeIco(entries) {
  const HEADER = 6;
  const DIRECTORY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon, 2 = cursor
  header.writeUInt16LE(entries.length, 4);

  let offset = HEADER + DIRECTORY * entries.length;
  const directory = [];
  for (const entry of entries) {
    const record = Buffer.alloc(DIRECTORY);
    // 256 is written as 0: the field is one byte and the format predates it.
    record.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    record.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    record.writeUInt8(0, 2); // palette size, 0 for truecolour
    record.writeUInt8(0, 3); // reserved
    record.writeUInt16LE(1, 4); // colour planes
    record.writeUInt16LE(32, 6); // bits per pixel
    record.writeUInt32LE(entry.png.length, 8);
    record.writeUInt32LE(offset, 12);
    directory.push(record);
    offset += entry.png.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.png)]);
}
