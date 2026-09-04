/**
 * Which set of mannequin renders the app is currently drawing from.
 *
 * There are two, and they have the same shape on purpose:
 *
 * - **The catalog's**, installed from `GET /v1/catalog` when the app has an API
 *   to talk to. Every entry is a `{ uri }` pointing at a content-addressed
 *   object on the CDN.
 * - **The bundle's**, `mannequinRenders.generated.ts`, where every entry is a
 *   `require()` handle. This is what the repo runs on with no server and no
 *   network, and it is why `npm start` still works on a fresh checkout.
 *
 * `mannequinRender()` and friends read whichever is active and neither knows
 * which it got, because a `number` and a `{ uri }` are both things
 * `react-native-svg`, `Image.prefetch` and `<Image>` already accept. That
 * equivalence is the entire trick, and it is why moving the catalog to a backend
 * did not require touching a single screen.
 *
 * The bundled module is the *fallback*, not the default: once the API answers,
 * the local renders are never consulted. Leaving them in the repo is a
 * transitional convenience — see the note at the bottom of
 * docs/catalog-architecture.md about deleting them.
 */

import {
  mannequinMasks as bundledMasks,
  mannequinRenders as bundledRenders,
} from '@/api/mannequinRenders.generated';
import type { Gender, HairLengthId, RenderManifest, VariantId } from '@/api/types';
import type { ViewAngle } from '@/lib/hairShape';

/**
 * Anything the platform can draw.
 *
 * `number` is a bundled asset's registry handle; `{ uri }` is a remote image.
 * Widened from the generated module's `number`, which stays exactly as it is —
 * `number` is a subtype of this, so the bundled maps are assignable without a
 * cast and the generator does not have to learn about the backend.
 */
export type RenderSource = number | { uri: string };

export type RenderViewMap = Partial<Record<ViewAngle, RenderSource>>;
export type RenderGenderMap = Partial<Record<Gender, RenderViewMap>>;
export type RenderLengthMap = Partial<Record<HairLengthId, RenderGenderMap>>;
export type RenderVariantMap = Partial<Record<VariantId, RenderLengthMap>>;
export type RenderIndex = Record<string, RenderVariantMap>;

/**
 * Two sources resolving to the same image.
 *
 * Object identity is not enough once entries are `{ uri }`: the manifest is
 * parsed fresh out of JSON, so two candidates pointing at one file are two
 * distinct objects that must still count as one image. `renderedVariants()`
 * depends on this to decide whether a card has anything worth cycling through,
 * and getting it wrong shows up as a card dissolving between two identical
 * pictures.
 */
export function sameSource(a: RenderSource, b: RenderSource): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  return a.uri === b.uri;
}

/** A stable key for a source, for the preload cache's `Set`. */
export const sourceKey = (source: RenderSource): string | number =>
  typeof source === 'number' ? source : source.uri;

let renders: RenderIndex = bundledRenders;
let masks: RenderIndex = bundledMasks;
let remote = false;

/**
 * Installs the catalog's imagery, or restores the bundled set with `null`.
 *
 * Called once by `CatalogProvider` when the catalog resolves. It is a module
 * global rather than context because `mannequinRender()` is a plain function
 * called from inside render bodies, memo factories and the try-on's request
 * builder — threading a provider through all of those would be a large change
 * to make one small one, and there is only ever one catalog in a process.
 */
export function setRenderIndex(manifest: RenderManifest | null | undefined): void {
  if (!manifest) {
    renders = bundledRenders;
    masks = bundledMasks;
    remote = false;
    return;
  }

  const next: RenderIndex = {};
  const nextMasks: RenderIndex = {};

  for (const [styleId, byVariant] of Object.entries(manifest)) {
    for (const [variant, byLength] of Object.entries(byVariant ?? {})) {
      for (const [length, byGender] of Object.entries(byLength ?? {})) {
        for (const [gender, byAngle] of Object.entries(byGender ?? {})) {
          for (const [angle, ref] of Object.entries(byAngle ?? {})) {
            if (!ref?.url) continue;
            const path = [styleId, variant as VariantId, length as HairLengthId, gender as Gender, angle as ViewAngle] as const;
            put(next, path, { uri: ref.url });
            // A render with no mask is a supported state, not a broken one: it
            // is graded whole rather than not at all. So the mask index has a
            // hole where the render index does not, exactly as it does on disk.
            if (ref.maskUrl) put(nextMasks, path, { uri: ref.maskUrl });
          }
        }
      }
    }
  }

  renders = next;
  masks = nextMasks;
  remote = true;
}

function put(
  index: RenderIndex,
  [styleId, variant, length, gender, angle]: readonly [string, VariantId, HairLengthId, Gender, ViewAngle],
  source: RenderSource,
): void {
  const byVariant = (index[styleId] ??= {});
  const byLength = (byVariant[variant] ??= {});
  const byGender = (byLength[length] ??= {});
  const byAngle = (byGender[gender] ??= {});
  byAngle[angle] = source;
}

export const renderIndex = (): RenderIndex => renders;
export const maskIndex = (): RenderIndex => masks;

/**
 * Whether the active index came from the API.
 *
 * Read by the try-on, which can hand fal a URL directly when it did and has to
 * base64 the bundled PNG when it did not, and by Settings, which says which of
 * the two the build is running on rather than letting the user guess.
 */
export const usingRemoteRenders = (): boolean => remote;
