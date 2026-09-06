/**
 * Getting an identity token out of Apple or Google.
 *
 * Both SDKs are native, so both are loaded lazily and both degrade to
 * "unavailable" rather than throwing — the web build and Expo Go have neither,
 * and email sign-in works everywhere and is the fallback.
 *
 * Nothing here decides anything. The token these functions return is verified on
 * the server against the provider's published keys (`server/src/accounts.ts`);
 * this module's entire job is to obtain it and hand it over. In particular the
 * email and name Apple returns are *not* treated as facts here — they are passed
 * along as labels and the server treats them the same way.
 *
 * ## Apple gives the name exactly once
 *
 * The first time a user authorises the app, Apple includes `fullName`. On every
 * subsequent sign-in it is null, forever, on every device. So it is sent when it
 * is there and never asked for again — an app that expects it on the second
 * sign-in ends up with an account called "null".
 */

import { Platform } from 'react-native';

import type { AuthProvider } from '@/api/account';

/** The Google OAuth client ids. Public by design; they identify, they do not authorise. */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export interface IdentityResult {
  provider: AuthProvider;
  token: string;
  email: string | null;
  displayName: string | null;
}

export type SignInOutcome =
  | { status: 'ok'; identity: IdentityResult }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

/**
 * Whether Sign in with Apple can be offered at all.
 *
 * iOS only, and only where the OS supports it. Apple's guideline 4.8 requires an
 * equivalent private option *wherever a third-party login is offered*, which is
 * why this and `googleAvailable` are asked separately rather than assumed
 * together — an Android phone offering Google and no Apple is fine, an iPhone
 * doing the same is a rejection.
 */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const apple = await import('expo-apple-authentication');
    return await apple.isAvailableAsync();
  } catch {
    return false;
  }
}

export const googleAvailable = (): boolean => Platform.OS !== 'web' && !!GOOGLE_WEB_CLIENT_ID;

export async function signInWithApple(): Promise<SignInOutcome> {
  try {
    const apple = await import('expo-apple-authentication');
    const credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return { status: 'failed', message: 'Apple returned no identity token' };

    // Present on the very first authorisation only — see the module header.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    return {
      status: 'ok',
      identity: {
        provider: 'apple',
        token: credential.identityToken,
        email: credential.email ?? null,
        displayName: name || null,
      },
    };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') return { status: 'cancelled' };
    return { status: 'failed', message: error instanceof Error ? error.message : 'Apple sign-in failed' };
  }
}

export async function signInWithGoogle(): Promise<SignInOutcome> {
  if (!googleAvailable()) return { status: 'unavailable' };
  try {
    const { GoogleSignin, statusCodes } = await import('@react-native-google-signin/google-signin');
    /**
     * `webClientId` is what decides the token's audience, and it is the one that
     * has to be configured even on iOS: the id token Google mints is issued to
     * the *web* client, and the server's `aud` check will not otherwise match.
     * `iosClientId` is separate and is about which app is asking.
     */
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : null),
    });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const result = await GoogleSignin.signIn();
    // Newer versions wrap the payload in `{ type, data }`; older ones return it
    // flat. Read both rather than pinning to one, since this is the shape that
    // changed most recently in this SDK.
    const user = (result as { data?: { idToken?: string | null; user?: { email?: string; name?: string } } }).data
      ?? (result as { idToken?: string | null; user?: { email?: string; name?: string } });
    if (!user?.idToken) return { status: 'failed', message: 'Google returned no identity token' };

    return {
      status: 'ok',
      identity: {
        provider: 'google',
        token: user.idToken,
        email: user.user?.email ?? null,
        displayName: user.user?.name ?? null,
      },
    };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') return { status: 'cancelled' };
    return { status: 'failed', message: error instanceof Error ? error.message : 'Google sign-in failed' };
  }
}

/** Clears the native session so the next sign-in asks again. */
export async function forgetProviders(): Promise<void> {
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut().catch(() => undefined);
  } catch {
    // Nothing to forget on a build without the module.
  }
}
