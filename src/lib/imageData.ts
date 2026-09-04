import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Image, Platform } from 'react-native';

import type { RenderSource } from '@/api/renderIndex';
import type { PixelSize } from '@/lib/imageSize';

/**
 * Images as `data:` uris, which is the only form both ends of the try-on agree
 * on.
 *
 * The generator hands fal.ai a reference image and the user's photo in one
 * request. Neither exists anywhere fal can reach: the reference is a PNG inside
 * the app bundle, and the photo is a file on the user's device that has — by
 * design — never left it. So both are read into base64 and inlined.
 *
 * This is now the *fallback* path only. With a backend configured the photo is
 * uploaded straight to a private bucket (`src/api/previews.ts`), the reference
 * is already a url in the catalog's own storage, and fal is handed two urls
 * rather than two megabytes of base64. What is left here is what a checkout with
 * no server does, and `dataUriCache` keeps the encode cost to once per asset per
 * session while it does it.
 */

/** Bundled assets never change under us, so their encoding is cached forever. */
const dataUriCache = new Map<string | number, Promise<string>>();

/**
 * The catalog's reference render, in whatever form fal can fetch it.
 *
 * This is where hosting the catalog pays off at runtime rather than at install
 * time. A bundled reference has to be read off the device and base64-inlined
 * into the request — roughly 550 KB of text on the user's uplink, on every
 * single preview, for an image that is identical for every user who taps that
 * card. A hosted one is already at a public url, so the request carries the url
 * and fal fetches the bytes itself, from a CDN, over a much better connection
 * than a phone has.
 *
 * The user's own photo is still inlined and always will be while generation runs
 * from the app: it is private, it has never left the device, and uploading it
 * somewhere public so a model could fetch it would be a worse arrangement than
 * the one we are trying to improve.
 */
export function referenceImageUri(source: RenderSource): Promise<string> {
  return typeof source === 'number' ? assetDataUri(source) : Promise.resolve(source.uri);
}

/** `require()`d PNG -> `data:image/png;base64,...`. */
export function assetDataUri(module: number): Promise<string> {
  const cached = dataUriCache.get(module);
  if (cached) return cached;

  const pending = (async () => {
    const asset = Asset.fromModule(module);
    // On web this resolves to the url Metro serves the file from; on device it
    // downloads the bundled asset into the cache directory and gives a file uri.
    if (!asset.localUri && !asset.uri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('bundled asset has no uri');
    return readAsDataUri(uri, 'image/png');
  })();

  dataUriCache.set(module, pending);
  // A failed encode must not be remembered as the answer.
  pending.catch(() => dataUriCache.delete(module));
  return pending;
}

/**
 * A photo uri -> `data:` uri.
 *
 * Not cached: the user can pick a new photo behind the same uri, and a photo is
 * read at most once per generation anyway.
 */
export function photoDataUri(uri: string): Promise<string> {
  return readAsDataUri(uri, 'image/jpeg');
}

/**
 * A photo uri -> its pixel dimensions, or null.
 *
 * Used to ask the model for the photograph's own shape rather than a fixed one
 * — see `src/lib/imageSize.ts` for why the shape is worth the trouble.
 *
 * `Image.getSize` rather than a header parse: it is the one call that already
 * knows how to decode every uri this app produces on every platform it runs on
 * — a `file://` from the picker, a `blob:` from the web file input, a `data:`
 * — and the decode is the part that is genuinely awkward to do by hand.
 *
 * **It never rejects.** A photograph that cannot be measured is not a failed
 * generation; it is a generation with no size in the request, which the model
 * answers with `auto`. Turning a measurement problem into a visible error would
 * be trading a slightly misaligned wipe for no preview at all.
 */
export function photoPixelSize(uri: string): Promise<PixelSize | null> {
  return new Promise((resolve) => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve(width > 0 && height > 0 ? { width, height } : null),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * The one uri -> base64 step, done the way each platform can actually do it.
 *
 * Web has no file system to speak of, but every uri it produces — the Metro
 * asset url, a `blob:` from the file input — is fetchable, and `FileReader`
 * turns the blob into a data uri. Native is the other way round: `fetch` of a
 * `file://` uri is not portable across iOS and Android, so the file is read
 * directly instead. Anything already inline is returned untouched on both.
 */
async function readAsDataUri(uri: string, fallbackMime: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;

  if (Platform.OS === 'web' || uri.startsWith('http://') || uri.startsWith('https://')) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`could not read ${uri.slice(0, 64)}: ${response.status}`);
    return blobToDataUri(await response.blob());
  }

  const base64 = await new File(uri).base64();
  return `data:${mimeFor(uri) ?? fallbackMime};base64,${base64}`;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('could not read image'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Enough of a guess for the models that care; the extension is all we have. */
function mimeFor(uri: string): string | null {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return null;
}

/**
 * Pulls a generated image down to the device and hands back a local uri.
 *
 * A finished look arrives as a url on somebody else's storage — fal's, or a
 * signed url against our own transient bucket — and neither is a thing to keep.
 * Both expire, and the second one is *meant* to: the whole arrangement is that
 * the preview lives on this phone and nowhere else, which is only true once it
 * has actually been written here.
 *
 * **`Paths.document`, not `Paths.cache`.** This used to write into the cache
 * directory, which iOS and Android are free to empty whenever they want space —
 * so a look the user had saved could quietly become a broken image weeks later,
 * with nothing to re-download it from. A saved look is user data: it stays until
 * its owner deletes it, and that is what the documents directory means.
 *
 * The cost is that these files are the app's own to clean up, which is exactly
 * right — `removeLook` is where a look stops existing, and nothing else should
 * be able to remove one.
 *
 * Best effort by design. Web has no file system to download into and returns the
 * url untouched, and any failure does the same rather than losing the look: a
 * remote image still displays for as long as its url lasts.
 */
export async function saveLookImage(url: string, name: string): Promise<string> {
  if (Platform.OS === 'web' || !url.startsWith('http')) return url;
  try {
    const directory = new Directory(Paths.document, 'looks');
    if (!directory.exists) directory.create({ intermediates: true });
    const file = await File.downloadFileAsync(url, new File(directory, name));
    return file.uri;
  } catch {
    return url;
  }
}
