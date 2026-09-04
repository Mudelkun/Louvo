import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';


import { SHARE_MIME } from '@/lib/shareImage';

/**
 * Handing the finished card to another app.
 *
 * The most important paragraph in this feature, because it is the one where the
 * obvious implementation is a lie.
 *
 * **What an operating system actually lets an app do.** On both platforms the
 * supported way to send an image to Instagram, WhatsApp or Facebook is the
 * system share sheet — `UIActivityViewController` on iOS, the `ACTION_SEND`
 * chooser on Android. Neither can be pointed at a *specific* app from managed
 * Expo code: iOS has no targeting API at all, Android's exists but needs an
 * intent with `setPackage` and a `FileProvider` grant, which is native code this
 * project does not have. The URL schemes that look like a way round it are not
 * one — `whatsapp://send?text=` carries text and no image, and Instagram's story
 * endpoint needs custom pasteboard types.
 *
 * So the three named buttons are **shortcuts into the sheet**, not fake direct
 * shares, and the screen says so in a line of copy. The sheet is where those
 * three apps live, it lists exactly the ones this phone actually has, and it is
 * the flow every user already knows. A row of buttons that each opened the same
 * sheet while pretending to be a direct hand-off would be the "fake
 * social-sharing buttons" the brief rules out; a row that says "pick Instagram
 * in the sheet" is the platform's real behaviour with a shorter path to it.
 *
 * The seam is `shareTo()`: it takes the channel, so the day a native intent
 * module is added, Android gets genuine per-app targeting and nothing above this
 * function changes.
 *
 * **The caption is the part that differs per platform**, and it is why this is
 * not a one-liner:
 *
 * - **iOS** takes a message and a file in the same activity, so the caption and
 *   the image travel together and the sheet even tells us which app took them.
 * - **Android's** `ACTION_SEND` can carry both, but `expo-sharing` sends only
 *   the file. So the caption goes to the clipboard first and the screen says it
 *   is there — which is the pattern every social app on Android already uses,
 *   because Instagram strips pasted-in captions from a share intent anyway.
 * - **Web** has no capture and no file, so it uses the real web share intents,
 *   which *are* per-platform: `wa.me` and Facebook's sharer take a url directly.
 */

export type ShareChannelId = 'instagram' | 'whatsapp' | 'facebook' | 'system';

export interface ShareChannel {
  id: ShareChannelId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * The app's own brand colour, or null for "More", which is not an app.
   *
   * Null rather than a neutral from the palette: this list is module data and
   * the palette is a runtime value now, so the one channel with no brand of its
   * own is resolved where it is drawn.
   */
  tint: string | null;
}

/**
 * The row, in the order it is drawn.
 *
 * Instagram first because a hairstyle result is a picture and Instagram is where
 * pictures go; WhatsApp second because it is where a picture goes to one person
 * who asked. "More" is the same sheet with no app named, for everything this
 * list does not enumerate — Messages, Telegram, Snapchat, email, AirDrop.
 */
export const SHARE_CHANNELS: ShareChannel[] = [
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', tint: '#C13584' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', tint: '#25D366' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', tint: '#1877F2' },
  { id: 'system', label: 'More', icon: 'ellipsis-horizontal', tint: null },
];

export interface ShareRequest {
  /** The composed card, or the raw preview when composition was not possible. */
  imageUri: string | null;
  /** The full message: what the sharer is saying, plus the invitation and link. */
  caption: string;
  /** The referral link on its own, for the web intents that take a url. */
  url: string;
  title: string;
}

export interface ShareOutcome {
  status: 'shared' | 'dismissed' | 'unavailable' | 'failed';
  /** iOS names the app that took the share. The only place this is a fact. */
  activity?: string | null;
  /** True when the caption had to go via the clipboard. Shown to the user. */
  captionCopied?: boolean;
  /** Why, when the status is `unavailable` or `failed`. User-facing. */
  message?: string;
}

/**
 * Sends a share, by whatever route this platform actually supports.
 *
 * Never throws: every failure is a `ShareOutcome` the screen can render, because
 * a thrown error here would surface as a red box over somebody's finished
 * haircut. `dismissed` is a first-class outcome rather than a failure — backing
 * out of the sheet is a decision, and the funnel records it as one.
 */
export async function shareTo(channel: ShareChannelId, request: ShareRequest): Promise<ShareOutcome> {
  try {
    if (Platform.OS === 'web') return await shareOnWeb(channel, request);
    if (Platform.OS === 'ios') return await shareOnIOS(channel, request);
    return await shareOnAndroid(channel, request);
  } catch (error) {
    return { status: 'failed', message: (error as Error).message };
  }
}

/** The label the OS sheet is opened under — Android shows it as the chooser title. */
const dialogTitleFor = (channel: ShareChannelId, name: string): string =>
  channel === 'system' ? 'Share your look' : `Share to ${name}`;

const nameOf = (channel: ShareChannelId): string =>
  SHARE_CHANNELS.find((entry) => entry.id === channel)?.label ?? 'another app';

/**
 * iOS: one activity carrying both the caption and the image.
 *
 * React Native's own `Share` rather than `expo-sharing`, and this is the one
 * platform where the choice matters: `Share.share` puts `message` and `url` into
 * the activity together, so the caption and the picture arrive as one item, and
 * the resolved action names the app that took it. `expo-sharing` sends the file
 * alone and reports nothing back.
 */
async function shareOnIOS(channel: ShareChannelId, request: ShareRequest): Promise<ShareOutcome> {
  const result = await Share.share(
    {
      title: request.title,
      message: request.caption,
      // A `file://` here is the image; with no card composed there is nothing to
      // attach and the share is the caption and its link, which is still a share.
      ...(request.imageUri ? { url: request.imageUri } : null),
    },
    { subject: request.title, dialogTitle: dialogTitleFor(channel, nameOf(channel)) },
  );

  if (result.action === Share.dismissedAction) return { status: 'dismissed' };
  return { status: 'shared', activity: result.activityType ?? null };
}

/**
 * Android: the file through the chooser, the caption through the clipboard.
 *
 * `expo-sharing` is the only managed route to `ACTION_SEND` with an image, and
 * it takes no text. Dropping the caption would drop the link, which is the
 * entire referral loop — so it goes to the clipboard and the screen says it is
 * there. Instagram would have stripped it from the intent regardless; WhatsApp
 * and Messages accept a paste.
 *
 * `expo-sharing` resolves when the chooser is dismissed and never says what
 * happened, so the outcome is `shared` optimistically. That is a real limit of
 * the platform and the funnel is read with it in mind: on Android
 * `share_completed` means "the sheet closed", on iOS it means "an app took it".
 */
async function shareOnAndroid(channel: ShareChannelId, request: ShareRequest): Promise<ShareOutcome> {
  const captionCopied = await copyCaption(request.caption);

  if (!request.imageUri) {
    // No image to send, so this is a text share and `Share.share` is the right
    // call — Android's version takes a message and nothing else, which is
    // exactly what is left.
    const result = await Share.share({ title: request.title, message: request.caption });
    return result.action === Share.dismissedAction
      ? { status: 'dismissed', captionCopied }
      : { status: 'shared', captionCopied };
  }

  if (!(await Sharing.isAvailableAsync())) {
    return {
      status: 'unavailable',
      captionCopied,
      message: 'This device has no app that can accept a shared image.',
    };
  }

  await Sharing.shareAsync(request.imageUri, {
    mimeType: SHARE_MIME,
    dialogTitle: dialogTitleFor(channel, nameOf(channel)),
    UTI: 'public.jpeg',
  });
  return { status: 'shared', captionCopied };
}

/**
 * Web: the real per-platform intents, because on the web they exist.
 *
 * This is the one platform where the three buttons genuinely do three different
 * things. `navigator.share` is preferred where the browser has it — on a phone
 * it opens the same OS sheet a native app would — and the named intents are the
 * fallback.
 *
 * Instagram is the exception and is honest about it: it has no web share
 * endpoint of any kind, so a browser can only be told to save the image and post
 * it from the app. Saying that is better than opening instagram.com and hoping.
 */
async function shareOnWeb(channel: ShareChannelId, request: ShareRequest): Promise<ShareOutcome> {
  const navigatorShare = (globalThis as { navigator?: Navigator }).navigator?.share;

  if (channel === 'system' || channel === 'instagram') {
    if (navigatorShare) {
      try {
        await navigatorShare.call(navigator, {
          title: request.title,
          text: request.caption,
          ...(request.url ? { url: request.url } : null),
        });
        return { status: 'shared' };
      } catch (error) {
        // The browser reports a cancelled sheet as an AbortError, which is a
        // decision rather than a failure and must not be shown as one.
        if ((error as Error).name === 'AbortError') return { status: 'dismissed' };
        return { status: 'failed', message: (error as Error).message };
      }
    }
    if (channel === 'instagram') {
      return {
        status: 'unavailable',
        message: 'Instagram has no web share. Save the image and post it from the app.',
      };
    }
    await copyCaption(request.caption);
    return { status: 'shared', captionCopied: true };
  }

  if (!request.url) {
    return { status: 'unavailable', message: 'This build has no share link configured.' };
  }

  const href =
    channel === 'whatsapp'
      ? `https://wa.me/?text=${encodeURIComponent(request.caption)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(request.url)}`;

  globalThis.open?.(href, '_blank', 'noopener,noreferrer');
  return { status: 'shared' };
}

/** Best effort, and its failure is never the user's problem. */
async function copyCaption(caption: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(caption);
    return true;
  } catch {
    return false;
  }
}
