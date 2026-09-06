/**
 * Turning screenshots off.
 *
 * The catalog's whole product is a haircut rendered on a head. A screenshot of
 * a style card or of a finished preview is that render, extracted, and it goes
 * straight into somebody else's image model as a reference — which is the one
 * use of this app's output that costs us the customer and pays us nothing. So
 * the app asks the operating system not to let its own window be captured, on
 * every screen, for as long as it is running.
 *
 * `expo-screen-capture` is the mechanism, and it is the same one the messaging
 * apps use. It is worth knowing exactly what each platform does, because the two
 * are not the same strength and the difference decides what the copy in Settings
 * is allowed to claim:
 *
 * - **Android** sets `FLAG_SECURE` on the activity's window. The OS refuses the
 *   screenshot outright — the shutter does not fire, the user gets the system's
 *   "can't take screenshots due to security policy" toast, screen recordings
 *   come back black, and the recents preview is blank. This is airtight, and it
 *   is enforced below the app.
 * - **iOS** has no API that refuses a screenshot, so the module uses the trick
 *   every banking app uses: the app's window layer is parented into a secure
 *   `UITextField`'s layer, which the render server omits from any screen
 *   capture. The shutter still fires and a file still lands in Photos — it is
 *   **black**. Nothing of ours leaves, which is the point, but a user does get a
 *   picture of nothing rather than a refusal, which is what
 *   `<ScreenCaptureGuard>` exists to explain.
 *
 * Two holes are closed alongside it, both iOS-only, because the secure layer
 * does not cover them: the app switcher's snapshot and the picture the system
 * takes when the app resigns active (a call, Control Center, a permission
 * dialog). `enableAppSwitcherProtectionAsync` blurs both. Android needs neither
 * — `FLAG_SECURE` already blanks the recents card.
 *
 * **The web build is not protected and cannot be.** A browser tab cannot refuse
 * the operating system's own screenshot key, and there is no flag to ask for.
 * That is reported rather than papered over, exactly as the catalog's and the
 * generator's sources are.
 *
 * ## What this does not stop
 *
 * A second phone photographing the screen. Nothing in software stops that, and
 * no amount of this changes it. What it stops is the *easy, lossless, one-tap*
 * copy, which is the one that actually happens.
 */

import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

/**
 * Two outcomes, reported in the same shape as `catalogSource()` and
 * `generationSource()`: what the running app actually got, not what the build
 * intended. `unavailable` is the web build and any runtime with no native
 * module behind it — Expo Go, which does not carry this one.
 */
export type ScreenCaptureSource = 'blocked' | 'unavailable';

/**
 * A key, so this is one holder of the block rather than an anonymous global.
 * `expo-screen-capture` counts holders and only re-allows capture when the last
 * of them lets go; naming ours means a future screen that wants to lift the
 * block for itself cannot lift this one by accident.
 */
const GUARD_KEY = 'luvo.app';

let source: ScreenCaptureSource = 'unavailable';

/** What happened when the block was last asked for. */
export function screenCaptureSource(): ScreenCaptureSource {
  return source;
}

/**
 * Asks the platform to stop capturing this app's window, and reports which of
 * the two outcomes happened.
 *
 * It never throws. A phone that cannot block screenshots is still a phone that
 * should show somebody their haircut, so a failure here degrades the protection
 * and nothing else — and it is *recorded* rather than swallowed, so Settings can
 * say so.
 */
export async function blockScreenCapture(): Promise<ScreenCaptureSource> {
  if (Platform.OS === 'web') {
    source = 'unavailable';
    return source;
  }

  try {
    await ScreenCapture.preventScreenCaptureAsync(GUARD_KEY);
    if (Platform.OS === 'ios') {
      // The second hole, and only on iOS. Failing this does not fail the block
      // itself — the window is already secure — so it is caught on its own.
      await ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => undefined);
    }
    source = 'blocked';
  } catch (error) {
    source = 'unavailable';
    if (__DEV__) {
      console.warn(
        `[screen-capture] screenshots are not blocked in this build: ${(error as Error).message}. ` +
          'The native module is missing — Expo Go does not carry it, so use a dev build.',
      );
    }
  }

  return source;
}

/**
 * Fires when the user takes a screenshot while the app is in front of them.
 *
 * On iOS that means they pressed the buttons and got a black picture, which is
 * the only case anything is done about. On Android the OS refuses the capture
 * outright, so this never fires while the block holds — and if it ever does,
 * the block is gone and the listener is the only thing that would say so.
 *
 * Returns an unsubscribe, and returns a no-op on the platforms with no module
 * rather than throwing, so a caller never has to ask which platform it is on.
 */
export function onScreenshot(listener: () => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  try {
    const subscription = ScreenCapture.addScreenshotListener(listener);
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}
