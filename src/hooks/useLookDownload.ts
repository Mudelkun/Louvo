import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { DEMO_PHOTO } from '@/lib/constants';

export type DownloadStatus = 'idle' | 'busy' | 'done';

/**
 * Saves a look's image to the device.
 *
 * This one is real, not mocked: on iOS and Android `expo-media-library` writes
 * the local file straight to the camera roll, and on web the browser downloads
 * it. No server is involved — the file already lives on the device.
 *
 * A generated look is already a local file by the time it gets here: the result
 * is pulled off the generator's storage and cached on device as soon as it
 * lands (`saveLookImage`), because those urls expire and `saveToLibraryAsync`
 * wants a file rather than a link. A *simulated* look's `resultUri` is the
 * user's own photo, so what lands in the camera roll is an unedited copy of it,
 * and the sample photo has no file at all (the mannequin is drawn as SVG at
 * render time) — nothing to hand the OS, so that case says so rather than
 * pretending to save.
 */
export function useLookDownload(uri: string | null | undefined) {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const savable = !!uri && uri !== DEMO_PHOTO;

  const download = useCallback(async () => {
    if (status !== 'idle') return;

    if (!savable || !uri) {
      notify(
        'Nothing to save yet',
        'The sample photo is drawn on the fly, so there is no image file behind it. Use your own photo to save a copy.',
      );
      return;
    }

    setStatus('busy');
    try {
      if (Platform.OS === 'web') {
        saveOnWeb(uri);
        setStatus('done');
        return;
      }

      // Write-only: saving does not need read access to the whole library.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        notify('Photo access needed', 'Allow Luvo to save photos to add this look to your camera roll.');
        setStatus('idle');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setStatus('done');
    } catch {
      notify('Could not save that', 'The image could not be written to your photos. Try again.');
      setStatus('idle');
    }
  }, [savable, status, uri]);

  return { status, savable, download };
}

/** Browsers have no camera roll — hand the file to the download shelf instead. */
function saveOnWeb(uri: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = `luvo-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    // Alert.alert is a no-op on web.
    console.warn(`${title}: ${message}`);
    return;
  }
  Alert.alert(title, message);
}
