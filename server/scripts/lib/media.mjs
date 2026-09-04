/**
 * Turning a catalog PNG into the bytes a phone should actually download.
 *
 * The renders on disk are 512x512 to 720x720 PNGs written by
 * `scripts/lib/png.mjs`, which deflates at level 9 with no row filtering — and
 * PNG is the wrong container for this content regardless. Measured across eight
 * representative renders, WebP q80 is **27.9x smaller** for the same pixels:
 * 3778.6 KB becomes 135.2 KB. That is the single largest lever on delivery cost
 * in the whole system, and it costs nothing but this file.
 *
 * Two rules that are not tuning knobs:
 *
 * - **Renders are lossy, masks are lossless.** A mask is a hard-edged greyscale
 *   stencil that decides which pixels the colour grade touches; lossy
 *   compression fringes exactly at the hairline, which is where the whole
 *   mechanism is judged. Lossless WebP still beats the source (3.9 KB against
 *   5.1 KB) because the content is nearly binary.
 * - **Nothing is resized.** The obvious move is a small tier for the browse
 *   grid, and it does not exist because there is no headroom: `CARD_WIDTH` is
 *   about 167pt, or 501 physical pixels on a 3x phone, against sources of 512
 *   to 720. Downscaling would soften every card to save 14 KB. If the
 *   generators ever shoot larger — the length sheets already use a 2K frame —
 *   add a tier here and a column on `renders`.
 */

import { createHash } from 'node:crypto';

import sharp from 'sharp';

/** Renders. 80 is the knee: q72 saves another 23% and starts to smear stubble. */
export const RENDER_QUALITY = 80;

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * How much of the hash goes in the key: 128 bits, as 32 hex characters.
 *
 * Not the whole digest, and the saving is real rather than cosmetic. Every URL
 * appears in the catalog payload that every phone downloads — twice per slot,
 * once for the render and once for its mask — so 32 characters costs about
 * 116 KB of raw JSON across today's 908 slots. Against roughly 2,500 objects at
 * 100 styles, 128 bits leaves the chance of a collision at around 1 in 10^30;
 * the digest was never the load-bearing part of the security here, since nobody
 * but the publish script can write to the bucket.
 */
const KEY_CHARS = 32;

/**
 * A content-addressed object key.
 *
 * The path is the hash, so two identical images are one object and a changed
 * image is a new URL no cache has ever seen. That is what lets every render be
 * served `immutable` for a year with no invalidation story at all.
 *
 * The first two characters become a directory purely so the bucket listing stays
 * navigable by hand; nothing depends on it.
 */
export const objectKey = (hash, extension = 'webp') =>
  `r/${hash.slice(0, 2)}/${hash.slice(0, KEY_CHARS)}.${extension}`;

/**
 * @param {Buffer} source  the PNG on disk
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<{ body: Buffer, contentType: string, width: number, height: number, hash: string }>}
 */
export async function encodeRender(source, { quality = RENDER_QUALITY } = {}) {
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const body = await image.webp({ quality, effort: 5 }).toBuffer();
  return { body, contentType: 'image/webp', width, height, hash: sha256(body) };
}

/**
 * The hair mask, lossless.
 *
 * Kept at the render's own size rather than at the render's *delivered* size,
 * because `<Mannequin>` draws both into the same box with the same
 * `preserveAspectRatio` — the mask scales to fit whatever it is laid over, so
 * one mask serves every future size tier.
 */
export async function encodeMask(source) {
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const body = await image.webp({ lossless: true, effort: 5 }).toBuffer();
  return { body, contentType: 'image/webp', width, height, hash: sha256(body) };
}
