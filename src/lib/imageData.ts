import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Image, Platform } from 'react-native';

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
 * TODO(backend): this disappears when generation moves server-side. The photo is
 * uploaded once to the API, the reference sheet is already sitting in the
 * catalog's object storage, and fal is handed two URLs instead of two megabytes
 * of base64. Until then `dataUriCache` keeps the encode cost to once per asset
 * per session.
 */

/** Bundled assets never change under us, so their encoding is cached forever. */
const dataUriCache = new Map<string | number, Promise<string>>();

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
 * A finished look comes back as a url on the generator's own storage, which is
 * the wrong thing to keep: those urls expire, and the two places a look is used
 * afterwards both want a file. "Save to camera roll" is one — `saveToLibraryAsync`
 * takes a file, not a link — and the library is the other, since a saved look
 * outliving its url would quietly turn into a broken image.
 *
 * Best effort by design. Web has no file system to download into and returns the
 * url untouched, and any failure does the same rather than losing the look: a
 * remote image still displays, it just cannot be saved.
 */
export async function cacheRemoteImage(url: string, name: string): Promise<string> {
  if (Platform.OS === 'web' || !url.startsWith('http')) return url;
  try {
    const directory = new Directory(Paths.cache, 'looks');
    if (!directory.exists) directory.create({ intermediates: true });
    const file = await File.downloadFileAsync(url, new File(directory, name));
    return file.uri;
  } catch {
    return url;
  }
}
