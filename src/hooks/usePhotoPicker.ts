import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import type { PickerMode } from '@/components/PhotoPickerSheet';
import { usePhotoPickerSheet } from '@/state/PhotoPickerContext';

/**
 * Gives screens a "give me a photo uri" entry point.
 *
 * On device both sources open the app's own bottom sheet — a live camera and
 * the recent-photos grid — which `PhotoPickerProvider` hosts at the root of the
 * app, so the screen behind it stays visible. Web has no sheet (no camera or
 * media-library support there), so it falls through to the system picker.
 *
 * The uri this hands back is a local one and stays local until the user asks
 * for a preview: `generateTryOn` reads the file, sends it to the image model and
 * keeps the result on the device. Nothing is uploaded by picking a photo, and
 * with no generator key configured nothing is uploaded at all. Once there is a
 * backend the photo goes to the API instead, which holds the model key.
 */
export function usePhotoPicker(onPicked: (uri: string) => void) {
  const sheet = usePhotoPickerSheet();
  const [busy, setBusy] = useState(false);

  const runNative = useCallback(
    async (source: 'library' | 'camera') => {
      setBusy(true);
      try {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            notify('Camera access needed', 'Allow camera access, or pick a photo from your library instead.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            cameraType: ImagePicker.CameraType.front,
            allowsEditing: true,
            aspect: [3, 4],
            quality: 0.85,
          });
          if (!result.canceled) onPicked(result.assets[0].uri);
          return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          notify('Photo access needed', 'Allow photo access, or use the sample photo to try the app.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.85,
        });
        if (!result.canceled) onPicked(result.assets[0].uri);
      } catch {
        notify('That did not work', 'Try again, or use the sample photo to explore the app.');
      } finally {
        setBusy(false);
      }
    },
    [onPicked],
  );

  const open = useCallback(
    (next: PickerMode) => {
      if (Platform.OS === 'web' || !sheet) {
        runNative(next === 'camera' ? 'camera' : 'library');
        return;
      }
      sheet.open(next, onPicked);
    },
    [onPicked, runNative, sheet],
  );

  return {
    busy,
    pickFromLibrary: () => open('photos'),
    takePhoto: () => open('camera'),
  };
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    // Alert.alert is a no-op on web.
    console.warn(`${title}: ${message}`);
    return;
  }
  Alert.alert(title, message);
}
