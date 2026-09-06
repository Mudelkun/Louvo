/**
 * What this install is, for the purpose of the two free generations.
 *
 * The free allowance is tied to a *device*, not to an installation — a
 * reinstall must not hand out two more — and the two platforms answer that
 * question very differently.
 *
 * **iOS needs nothing from this file.** The device secret in `deviceId.ts` lives
 * in the Keychain, and Keychain items survive the app being deleted. Reinstall
 * Luvo and `deviceSecret()` reads back the same 32 bytes, so the device is
 * already the same device to the server. There is no iOS identifier worth adding
 * on top: `identifierForVendor` *resets* once every app from the vendor is gone,
 * so it would be strictly worse than what the Keychain already provides.
 *
 * **Android needs exactly one thing.** The Keystore is cleared with the package,
 * so the secret does not survive a reinstall and the device id changes with it.
 * `ANDROID_ID` does survive: it is stable per app-signing-key and device, and
 * resets only on a factory reset. That single value is the anchor, and it is
 * sent as a header on every API request rather than registered by a call the app
 * has to remember to make first.
 *
 * ## What this is not
 *
 * It is not fingerprinting, and the line matters both ethically and for review.
 * No IP address, no screen metrics, no model or locale, and nothing composed
 * from them. Apple's guidelines forbid exactly that, and a probabilistic
 * identifier would deny free generations to people who had never had any — a
 * false positive here is a stranger being told they have already used their two.
 *
 * It is also not a claim to be unbeatable. A factory reset, a restore-as-new or
 * a second phone all produce a genuinely new device and are treated as one. The
 * defence against somebody determined to do that repeatedly is App Attest and
 * Play Integrity, which is its own piece of work; at roughly five cents a
 * generation the arms race is not yet worth entering.
 *
 * The raw value never reaches our database — the server salts and hashes it (see
 * `server/src/anchors.ts`) — so what is stored is an equality token rather than
 * a device identifier.
 */

import * as Application from 'expo-application';
import { Platform } from 'react-native';

/**
 * The header the server reads, or null when there is nothing to add.
 *
 * `kind:value`, comma-separated, so a second anchor could be added one day
 * without a second header or a version bump. Today there is exactly one, and on
 * two of the three platforms there are none.
 */
export function installAnchorHeader(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    // Synchronous, and Android-only — on any other platform this function does
    // not exist rather than returning null, hence the guard above rather than a
    // null check below.
    const androidId = Application.getAndroidId();
    // 16 lowercase hex characters. Anything else is a device reporting something
    // the server would reject anyway, and sending it would only put a value we
    // cannot use into a request log.
    return /^[0-9a-f]{16}$/i.test(androidId ?? '') ? `android_id:${androidId.toLowerCase()}` : null;
  } catch {
    // A device that will not tell us gets its own allowance, which is the
    // behaviour before this file existed. Never a reason to fail a request.
    return null;
  }
}
