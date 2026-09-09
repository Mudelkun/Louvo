import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NATIVE_DRIVER } from '@/lib/motion';
import { blockScreenCapture, onScreenshot, screenCaptureSource } from '@/lib/screenCapture';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const VISIBLE_MS = 5000;

/**
 * The app-wide screenshot block, mounted once at the root, plus the one line of
 * copy that makes its iOS behaviour comprehensible.
 *
 * `src/lib/screenCapture.ts` is the mechanism and the argument for it. This is
 * where it is switched on, and there are two decisions in it:
 *
 * **It re-arms only when it is not already armed.** The block is held for the
 * life of the process, so the ordinary case is one call at launch and nothing
 * after. Re-asking on every foreground would mean releasing and re-taking the
 * flag, and on Android toggling `FLAG_SECURE` recreates the window's surface —
 * a black flash on every return to the app, to fix nothing. So the foreground
 * pass runs only when the last attempt did *not* land, which is the case that
 * can genuinely change underneath us: an activity recreated by a configuration
 * change comes back without the flag.
 *
 * **A blocked screenshot is explained, not left as a bug.** On Android the OS
 * refuses the capture and says why in its own toast, so this never fires there.
 * On iOS the shutter fires and the picture is black — indistinguishable, to the
 * person holding the phone, from the app having broken. One line saying it was
 * deliberate, and where the real share button is, turns a support ticket into an
 * answered question. It is not a scolding: the user did nothing wrong, and the
 * copy points at the thing that does work.
 */
export function ScreenCaptureGuard() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [caught, setCaught] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void blockScreenCapture();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && screenCaptureSource() !== 'blocked') void blockScreenCapture();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => onScreenshot(() => setCaught(true)), []);

  useEffect(() => {
    if (!caught) return;
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: NATIVE_DRIVER }).start();
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: NATIVE_DRIVER }).start(() =>
        setCaught(false),
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [caught, fade]);

  useEffect(() => {
    if (!caught) fade.setValue(0);
  }, [caught, fade]);

  if (!caught) return null;

  return (
    // At the bottom, where `<LookNotification>` is not: a preview finishing and
    // a screenshot being taken are independent, and two banners landing on the
    // same coordinates would stack on top of each other.
    <Animated.View
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing.xl },
        { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Screenshots are turned off in Louvo. Use the share button to send your look. Dismiss."
        onPress={() => setCaught(false)}
        style={styles.card}
      >
        <Ionicons name="eye-off-outline" size={18} color={colors.onDark} />
        <Text style={[type.caption, styles.text]}>
          Screenshots come out blank in Louvo. Use <Text style={styles.strong}>Share</Text> to send your look —
          it goes out as a proper picture.
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  wrap: { pointerEvents: 'box-none', position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.stage,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.raised,
  },
  text: { flex: 1, color: colors.onDark },
  // The weight only: `type.bodyStrong` is three points larger than a caption,
  // and a nested run at a different size shifts the line it sits in.
  strong: { fontWeight: '700' as const },
}));
