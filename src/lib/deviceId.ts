/**
 * Who this phone is, to the preview backend.
 *
 * There are no accounts yet, and a preview queue still has to know whose job is
 * whose. So the app mints 32 random bytes the first time it needs them, keeps
 * them in the platform keystore, and sends them as a bearer token. The server
 * stores only a hash (`server/src/devices.ts`), so this secret is the one copy
 * that exists anywhere.
 *
 * Three properties worth being clear about, because this is deliberately less
 * than authentication:
 *
 * - **It identifies a device, not a person.** A reinstall is a new device. It
 *   loses the list of jobs in flight — not the looks, which are files on the
 *   phone — and that is the correct trade for not making somebody sign up before
 *   they can see themselves with a haircut.
 * - **It proves nothing about the caller being this app.** That is what costs
 *   money once the endpoint is public, and the answer to it is App Attest and
 *   Play Integrity, which is its own piece of work.
 * - **It is a secret, so it is never logged, shown or put in a url.**
 *
 * When real accounts arrive this does not go away: the device row gains a
 * `user_id` and the jobs already tied to it come along.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { installAnchorHeader } from '@/lib/installAnchor';

const KEY = 'luvo.device.v1';

/**
 * 32 random bytes, as hex.
 *
 * `expo-crypto` rather than `globalThis.crypto.getRandomValues`, which is what
 * this reached for first and is not there: Hermes has no WebCrypto of its own,
 * and the polyfill cannot be assumed present — the failure is at runtime, on a
 * phone, as "cannot mint a device identity" on the first generation somebody
 * tries. `getRandomBytesAsync` is the platform's own CSPRNG on all three
 * targets and it is a real dependency rather than a global that might be.
 *
 * Hex rather than base64url: the secret travels in an `Authorization` header and
 * is matched by a regex on the server, so having no `+`, no `/` and no padding
 * at either end is worth more than the 21 characters it costs.
 *
 * There is deliberately no `Math.random` fallback. A guessable device secret is
 * a guessable identity, and failing loudly is the only honest option — which is
 * exactly what happened here, and is why this was a visible error rather than a
 * quiet weakness.
 */
async function mint(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * SecureStore on a phone, AsyncStorage on the web.
 *
 * The web build is a development surface — the keystore has no browser
 * equivalent worth pretending about — and this is written down rather than
 * hidden so nobody later mistakes `npm run web` for a shipping target.
 */
const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(KEY);
    return SecureStore.getItemAsync(KEY);
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(KEY, value);
    await SecureStore.setItemAsync(KEY, value, {
      // The job list is polled while the app is in the foreground and jobs are
      // submitted from there too, so first-unlock is enough and avoids asking
      // for a passcode this feature has no business requiring.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};

/**
 * One in-flight mint, shared.
 *
 * Two screens asking at once must not produce two identities, one of which then
 * loses every job it created. The promise is the lock.
 */
let pending: Promise<string> | null = null;

export function deviceSecret(): Promise<string> {
  pending ??= (async () => {
    try {
      const existing = await store.get();
      if (existing) return existing;
      const secret = await mint();
      await store.set(secret);
      return secret;
    } catch (error) {
      pending = null;
      throw error;
    }
  })();
  return pending;
}

/**
 * The headers every API request carries.
 *
 * Two of them, and the second is only ever present on Android. `X-Install-Anchor`
 * is what lets the server recognise a reinstalled phone as the same device it
 * already gave two free generations to — the Keystore, unlike the Keychain, does
 * not survive the package being removed, so the secret above is not enough there.
 *
 * It rides on *every* request rather than on a registration call, which removes
 * the ordering bug that shape would have: a freshly reinstalled app whose first
 * action is to generate would otherwise be an unknown device with a fresh
 * allowance. See `installAnchor.ts` for what the value is and what it is not.
 */
export async function deviceHeader(): Promise<Record<string, string>> {
  const anchor = installAnchorHeader();
  return {
    Authorization: `Device ${await deviceSecret()}`,
    ...(anchor ? { 'X-Install-Anchor': anchor } : null),
  };
}
