import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MannequinBadge } from '@/components/Mannequin';
import { useHairColorById } from '@/hooks/useHairColor';
import { NATIVE_DRIVER } from '@/lib/motion';
import { textureFor, variantCandidates } from '@/lib/hairTypes';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const VISIBLE_MS = 6000;

/**
 * "Your look is ready" — the in-app stand-in for the push notification the user
 * gets once generation finishes in the background. Tapping it opens the result.
 *
 * TODO(backend): replace with expo-notifications so this also fires when the app
 * is backgrounded; the banner stays for the foreground case.
 */
export function LookNotification() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notification, dismissNotification } = useGeneration();
  const { styleById } = useCatalog();
  const { setLook } = useSession();
  const color = useHairColorById(notification?.options.color);

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notification) return;
    Animated.spring(slide, { toValue: 1, useNativeDriver: NATIVE_DRIVER, damping: 18, stiffness: 180 }).start();
    const timer = setTimeout(() => {
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: NATIVE_DRIVER }).start(
        dismissNotification,
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notification, slide, dismissNotification]);

  useEffect(() => {
    if (!notification) slide.setValue(0);
  }, [notification, slide]);

  if (!notification) return null;

  const hairstyle = styleById(notification.hairstyleId);

  const open = () => {
    dismissNotification();
    setLook(notification);
    router.push('/try/result');
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: insets.top + spacing.sm },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }],
        },
      ]}
    >
      {/* The dismiss button is a sibling of the card's own press target rather
          than a child of it: both are `accessibilityRole="button"`, which on
          web is a real `<button>`, and a button inside a button is invalid HTML
          that React refuses to render. They are two answers to a tap anyway —
          the card opens the look, the cross throws the banner away. */}
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notification.hairstyleName} preview is ready. Open it.`}
          onPress={open}
          style={({ pressed }) => [styles.cardBody, pressed && { opacity: 0.92 }]}
        >
          {hairstyle ? (
            <MannequinBadge
              styleId={hairstyle.id}
              shape={{ ...hairstyle.shape, texture: textureFor(hairstyle, notification.hairType) }}
              color={color}
              gender={notification.gender}
              variants={variantCandidates(hairstyle, notification.hairType)}
              size={38}
            />
          ) : (
            <View style={styles.fallbackBadge}>
              <Ionicons name="sparkles" size={17} color={colors.onDark} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.onDark }]} numberOfLines={1}>
              Your new look is ready
            </Text>
            <Text style={[type.caption, { color: colors.onDarkMuted }]} numberOfLines={1}>
              {notification.hairstyleName} · tap to view
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={10}
          onPress={dismissNotification}
        >
          <Ionicons name="close" size={18} color={colors.onDarkMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { pointerEvents: 'box-none', position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.raised,
  },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fallbackBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
