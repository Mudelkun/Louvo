import { Platform } from 'react-native';

/**
 * Whether an animation may be handed to the native driver.
 *
 * There is no native animated module on web, so every `useNativeDriver: true`
 * there is a warning on load and a silent fall back to the JS driver. Asking
 * for the driver only where one exists is the same animation without the noise.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';
