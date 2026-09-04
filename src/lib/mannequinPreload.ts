/**
 * Warming the renders a screen is about to be asked for.
 *
 * Switching hair type does not compute anything — `variantCandidates()` is three
 * object lookups — but it does change which ~350KB PNG every mannequin on screen
 * is drawing. On the style screen that is eight of them at once (four pager
 * pages and four thumbnails), each with a mask behind it, so a chip tap fires
 * sixteen cold image loads and the user watches the old texture sit there until
 * they land. Nothing in the app is slow; the images simply had not been asked
 * for yet.
 *
 * So they are asked for early. Every render this screen can reach is fetched
 * while the user is still reading the chips, and the tap is then a swap rather
 * than a load.
 *
 * Two details make it work rather than merely look like it works:
 *
 * - **It warms the loader that will actually draw the image.** A graded render
 *   goes through `react-native-svg`, which resolves its `href` through the
 *   platform's own image loader — the same one `Image.prefetch` fills. Priming
 *   `expo-image`'s cache instead would warm a cache nothing on this path reads.
 * - **One at a time.** Thirty-two concurrent requests would compete with the
 *   render the screen is currently drawing, which is the opposite of the point,
 *   and in dev they all go over Metro. The queue is ordered hero angle first,
 *   so the image a chip tap visibly changes is the first one ready.
 */

import { Asset } from 'expo-asset';
import { Image } from 'react-native';

import { sourceKey, type RenderSource } from '@/api/renderIndex';
import type { Gender, VariantId } from '@/api/types';
import { HERO_ANGLE, VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';
import { mannequinMask, mannequinRender } from '@/lib/mannequinRender';

/**
 * Sources already fetched — a warm asset is warm for the life of the process.
 *
 * Keyed by url (or asset handle) rather than by the source object, because a
 * catalog-supplied source is parsed out of JSON: the same render reached through
 * two candidates is two objects, and a `Set` of those would warm it twice.
 */
const warmed = new Set<string | number>();
const queue: RenderSource[] = [];
let draining = false;

/**
 * `Image.prefetch` wants a URI, which every bundled asset resolves to in dev and
 * on web. A release build can hand back a bare resource name that the prefetcher
 * will not take; `expo-asset` is the fallback that always understands a module
 * id, and at worst it guarantees the file is local before anything draws it.
 */
async function fetchSource(source: RenderSource): Promise<void> {
  // A catalog render is already a url and needs none of the resolution below —
  // this is the path every warm takes once the app is talking to the API.
  if (typeof source !== 'number') {
    await Image.prefetch(source.uri);
    return;
  }
  const uri = Image.resolveAssetSource(source)?.uri;
  if (uri) {
    await Image.prefetch(uri);
    return;
  }
  await Asset.fromModule(source).downloadAsync();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const source = queue.shift() as RenderSource;
    try {
      await fetchSource(source);
    } catch {
      // A warm that failed only costs a slow first draw, never a wrong image, so
      // it is forgotten rather than reported — and forgetting it is what lets the
      // next screen that needs this render try again. That matters more now than
      // it did: a bundled asset could only fail to decode, whereas a catalog
      // render can fail because the network dropped for a second.
      warmed.delete(sourceKey(source));
    }
  }
  draining = false;
}

function enqueue(source: RenderSource | null): void {
  if (!source) return;
  const key = sourceKey(source);
  if (warmed.has(key)) return;
  warmed.add(key);
  queue.push(source);
}

/** Hero angle first: it is the one a chip tap changes in front of the user. */
const PRELOAD_ANGLES: ViewAngle[] = [HERO_ANGLE, ...VIEW_ANGLES.filter((angle) => angle !== HERO_ANGLE)];

/**
 * Fetch every render and mask this style could be shown in, so switching between
 * its hair types costs nothing.
 *
 * Each variant is resolved on its own rather than as a candidate list, exactly
 * as `renderedVariants()` does it: a list collapses to the first entry that
 * exists, and the whole point here is to reach the ones that are not being shown
 * yet. Variants with no render of their own resolve to null and cost nothing —
 * they fall through to the procedural drawing, which has nothing to load.
 *
 * Safe to call on every render: a source is queued at most once per process.
 */
export function preloadVariants(
  styleId: string | null | undefined,
  gender: Gender | null | undefined,
  variants: VariantId[],
  /**
   * Which angles to warm. All four for a screen that shows all four; the grid
   * passes `[HERO_ANGLE]`, because a card only ever draws the hero and warming
   * the other three for every style on screen would be three quarters wasted.
   */
  angles: ViewAngle[] = PRELOAD_ANGLES,
): void {
  if (!styleId || !variants.length) return;

  for (const angle of angles) {
    for (const variant of variants) {
      enqueue(mannequinRender(styleId, gender, angle, [variant]));
      // The mask is a tenth the size of the render and useless without it, but
      // it is a second image on the same swap: left cold, the graded copy has
      // nothing to be held inside and the whole frame tints for a beat.
      enqueue(mannequinMask(styleId, gender, angle, [variant]));
    }
  }

  void drain();
}
