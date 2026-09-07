/**
 * The user's photograph, before it leaves the browser.
 *
 * Two jobs: measure it, and get it under a sensible size. Both are done on a
 * canvas, which is the only image pipeline a page has — and which is also why
 * this is the one place in the web app that touches raw pixels.
 *
 * ## What this promises, and what it does not
 *
 * The photograph does leave the browser. There is no design where it does not:
 * the generation is a job on a server so that it survives the tab being closed,
 * and a job that survives the tab cannot hold the image in the tab. What is
 * true, and what `docs/preview-generation.md` sets out in full, is where it goes
 * — straight into a private bucket with no public domain and no CDN, under a
 * 32-byte random key, read once through a url that expires in minutes, and
 * deleted the moment the job settles. It never touches the API process and it is
 * never in a database.
 *
 * What this module adds is that it goes *smaller*: a 12-megapixel phone photo is
 * about 4 MB of upload for detail the model discards, and the preview comes back
 * at roughly 2 megapixels either way.
 */

/**
 * The longest edge the model is sent — the app's `MAX_EDGE`, unchanged.
 *
 * 1536 keeps the head comfortably above the resolution where strand detail
 * starts disappearing, which is the failure `TRY_ON_RESOLUTION` exists for
 * approached from the input side: a fade's stubble field lands under a pixel and
 * comes back as a smooth mass.
 */
const MAX_EDGE = 1536;

const QUALITY = 0.85;

/** Refused before a canvas is allocated. The API's own ceiling is 12 MB. */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface PreparedPhoto {
  /** The bytes to PUT. JPEG, unless the original was already small enough. */
  blob: Blob;
  width: number;
  height: number;
  /** An object url for showing it. The caller owns it and must revoke it. */
  objectUrl: string;
}

export class PhotoError extends Error {
  readonly code: 'too_large' | 'unreadable' | 'unsupported';
  constructor(code: PhotoError['code'], message: string) {
    super(message);
    this.name = 'PhotoError';
    this.code = code;
  }
}

/**
 * Decodes a file into something with pixel dimensions.
 *
 * `createImageBitmap` where it exists — it decodes off the main thread, which on
 * a 12-megapixel photo is the difference between a dropped frame and a visible
 * freeze — and an `<img>` otherwise. Both are wrapped rather than one being
 * assumed, because Safari only grew `createImageBitmap` recently enough that a
 * phone in somebody's pocket may not have it.
 */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Falls through: Safari has historically refused some HEIC and some
      // progressive JPEGs here while decoding them perfectly well in an <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new PhotoError('unreadable', 'that image could not be opened'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Measures a photograph and downscales it if it is bigger than the model needs.
 *
 * Best effort, deliberately: a photo that decodes but cannot be re-encoded is
 * uploaded as it is. Failing somebody's generation because a resize failed would
 * be trading the feature for an optimisation.
 */
export async function preparePhoto(file: File | Blob): Promise<PreparedPhoto> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new PhotoError('too_large', 'that photo is over 20 MB — try one straight from the camera roll');
  }

  const { source, width, height } = await decode(file);
  if (!width || !height) {
    throw new PhotoError('unreadable', 'that image could not be opened');
  }

  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE && file.type === 'image/jpeg') {
    return { blob: file, width, height, objectUrl: URL.createObjectURL(file) };
  }

  const scale = Math.min(1, MAX_EDGE / longest);
  // Rounded rather than floored: a 1535.6 that becomes 1535 changes the aspect
  // ratio by enough that `imageSize.ts` picks a different output frame, and the
  // before/after wipe then crops the two halves by different amounts.
  const target = { width: Math.round(width * scale), height: Math.round(height * scale) };

  try {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) throw new Error('canvas produced nothing');

    return { blob, ...target, objectUrl: URL.createObjectURL(blob) };
  } catch {
    return { blob: file, width, height, objectUrl: URL.createObjectURL(file) };
  } finally {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  }
}

/**
 * A key that survives a retried submit without becoming a second generation.
 *
 * A second generation is a second five cents and a second credit, so this is
 * minted once per attempt and reused across every retry of that attempt — not
 * regenerated per request, which would defeat the whole point.
 */
export const newIdempotencyKey = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
