import { Alert, Platform } from 'react-native';

/**
 * Ask before something destructive, the way the platform asks it.
 *
 * `Alert.alert` is a no-op on web — `useLookDownload` and `usePhotoPicker` both
 * note it for their notices — and a delete gated on its callback would silently
 * never happen there. A notice that fails to show costs the user a sentence; a
 * confirmation that fails to show costs them the action, so web gets
 * `window.confirm` rather than a console line.
 *
 * The action runs from the callback and nowhere else: nothing is removed until
 * the user has answered.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
