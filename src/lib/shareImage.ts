/**
 * Turning the share card into a file.
 *
 * One function and one dependency: `react-native-view-shot` photographs a
 * mounted view. That is the whole mechanism, and it was chosen over the two
 * alternatives for reasons worth keeping:
 *
 * - **Not server-side compositing.** The server has `sharp` and could brand the
 *   image in a second. It would also mean uploading a finished preview of
 *   somebody's face back to us, which is precisely the thing
 *   `docs/preview-generation.md` spends a page arranging not to happen — the
 *   preview is downloaded to the phone and *deleted* from the server, and the
 *   only copy in existence is on the device. A share feature is a bad reason to
 *   undo that.
 * - **Not `expo-image-manipulator`.** It crops, scales, rotates and flips. It
 *   cannot draw a word on an image, and there is no other compositor on the
 *   device.
 *
 * The capture is at **3x the card's layout size** — 360 points out at 1080
 * pixels — which is what every social app resamples to anyway. Bigger is bytes
 * their encoder throws away; smaller is visibly soft on a modern phone.
 *
 * **Web has no capture.** `react-native-view-shot` is native-only, so the web
 * build shares the preview as it came out of the generator, unbranded, and says
 * nothing about it. The web build is a development surface (see the note in
 * `src/lib/deviceId.ts`), and pretending otherwise here would mean shipping a
 * second compositor for a target nobody installs.
 */

import type { RefObject } from 'react';
import { Platform } from 'react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { EXPORT_WIDTH } from '@/components/ShareCard';

/**
 * JPEG, not PNG.
 *
 * The card is a photograph with a line of text on it. PNG would be lossless and
 * about eight times the bytes, and every app it is being sent to re-encodes it
 * to JPEG on arrival — so the only thing lossless buys here is a slower upload
 * on somebody's cellular connection. 0.92 is above the quality where JPEG
 * artefacts appear around small light-on-dark type, which is the one part of
 * this frame that would show them.
 */
const FORMAT = 'jpg' as const;
const QUALITY = 0.92;

export const SHARE_MIME = 'image/jpeg';

export interface CapturedCard {
  uri: string;
  width: number;
  height: number;
}

/**
 * Photographs the mounted share card.
 *
 * Returns null rather than throwing on the platforms and situations where there
 * is nothing to capture — web, an unmounted ref — because **a share must not
 * fail because the branding could not be drawn.** The caller falls back to the
 * raw preview, which is a worse advertisement and a perfectly good share.
 *
 * `aspect` is the card's own, so the output keeps the shape the user is looking
 * at in the preview rather than a shape this function decided on.
 */
export async function captureShareCard(
  ref: RefObject<View | null>,
  aspect: number,
): Promise<CapturedCard | null> {
  if (Platform.OS === 'web' || !ref.current) return null;

  const width = EXPORT_WIDTH;
  // Rounded to an even number: some encoders quietly pad an odd dimension and
  // the padding lands as a one-pixel line along the bottom of the card, right
  // where the wordmark is.
  const height = Math.round(EXPORT_WIDTH / aspect / 2) * 2;

  const options = {
    format: FORMAT,
    quality: QUALITY,
    // The output size, not a transform: the view is laid out at `CARD_WIDTH`
    // points and rasterised straight to these pixels, so nothing in the card
    // has to know it is being enlarged.
    width,
    height,
    result: 'tmpfile' as const,
  };

  try {
    const uri = await captureRef(ref, options);
    return { uri, width, height };
  } catch (error) {
    // The one failure with a known cure, and it is the app's own screenshot
    // block causing it. `src/lib/screenCapture.ts` parents the window into a
    // secure layer on iOS, and the render server omits a secure subtree from
    // exactly the snapshot machinery `drawViewHierarchyInRect:` uses — which is
    // this library's default path, and which reports it as "a potential
    // technical or security limitation". `useRenderInContext` rasterises the
    // layer tree in process instead and is not subject to it.
    //
    // It is a retry rather than the default because the default is the better
    // renderer: `renderInContext:` misses anything the GPU composites late, a
    // `UIVisualEffectView` above all. The card is images, a gradient and text
    // today and comes out identical either way, so this costs one failed call
    // on iOS and nothing at all on Android, where `FLAG_SECURE` never touched
    // the in-process `view.draw()` the Android path uses.
    if (Platform.OS === 'ios') {
      try {
        const uri = await captureRef(ref, { ...options, useRenderInContext: true });
        return { uri, width, height };
      } catch (fallbackError) {
        if (__DEV__) {
          console.warn(`[share] could not compose the card: ${(fallbackError as Error).message}`);
        }
        return null;
      }
    }
    if (__DEV__) console.warn(`[share] could not compose the card: ${(error as Error).message}`);
    return null;
  }
}
