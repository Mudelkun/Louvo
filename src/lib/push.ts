/**
 * Push notifications, for the one thing this app has to say unprompted.
 *
 * A preview takes the better part of a minute and the queue in front of it can
 * be much longer than that, so the whole point of moving generation to a server
 * is that the user does not have to sit there. That is only true if something
 * tells them when it is done, and this is that something. It is the only
 * notification the app sends: no re-engagement, no marketing, nothing about
 * anything the user did not personally start.
 *
 * Expo's push service rather than APNs and FCM directly — one token, one server
 * call, credentials in the EAS project instead of in the deployment.
 *
 * ## What has to be true for this to work
 *
 * A development build (or a store build), not Expo Go: remote push was removed
 * from Expo Go on Android, and iOS needs an APNs key on the EAS project either
 * way. There must also be an EAS project id in `app.json`. All three are absent
 * on a fresh checkout, which is why every function here **fails soft**: no
 * project id, no permission or no token means no registration and no error. The
 * app is exactly as usable, the user just finds their preview when they open it.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { previewsConfigured, registerPushToken } from '@/api/previews';

/**
 * How a notification behaves when it lands while the app is open.
 *
 * Nothing is shown. If Luvo is in the foreground the finished preview is
 * already on screen or one tap away in My looks — a banner over it would be the
 * app telling the user about something they are looking at.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** EAS injects this at build time; a fresh checkout has neither. */
const projectId = (): string | null =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

/**
 * Android needs a channel before anything can be delivered to it.
 *
 * One channel, named for what it is. A generic "default" channel means the only
 * thing the user can turn off is everything, and the only notification this app
 * sends is one they asked for by pressing Generate.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('previews', {
    name: 'Finished previews',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Asks for permission, gets a token, and tells the backend about it.
 *
 * Returns the token or null, and never throws. `ask` is false on the paths that
 * only want to refresh an existing registration — a permission prompt on app
 * start, before the user has generated anything, is a prompt most people say no
 * to once and forever.
 */
export async function registerForPreviewPush(ask = false): Promise<string | null> {
  if (!previewsConfigured() || Platform.OS === 'web') return null;

  try {
    await ensureChannel();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && ask && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;

    const id = projectId();
    if (!id) {
      if (__DEV__) console.log('[push] no EAS project id — notifications are off in this build');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await registerPushToken(token, Platform.OS);
    return token;
  } catch (error) {
    // A failure here costs the notification and nothing else, and it is a
    // routine outcome rather than a bug: Expo Go on Android, a simulator with no
    // push entitlement, a device offline at the moment it was asked.
    if (__DEV__) console.log('[push] not registered:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fires when a notification is tapped.
 *
 * There is deliberately no separate cold-launch path. A notification that opens
 * the app from scratch is followed by `GenerationProvider` mounting and
 * reconciling against the server anyway, which finds and downloads the same
 * preview — so reading the launch notification would be a second route to a
 * thing that already happens, with its own way of getting out of step.
 *
 * The `previewId` payload is written by `readyMessage` in `server/src/push.ts`.
 */
export function onPreviewNotificationTapped(handler: (previewId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = response.notification.request.content.data?.previewId;
    if (typeof id === 'string') handler(id);
  });
  return () => subscription.remove();
}
