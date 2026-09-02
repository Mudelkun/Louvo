import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@/theme/theme';

/**
 * The favourite toggle.
 *
 * Saving a style is the one thing in the catalog the user does *to* an item
 * rather than to the flow, and it has no destination screen to confirm it — so
 * the confirmation has to be the control itself. Three things fire together on
 * a save: the outline is filled by a heart that springs in from nothing, the
 * button squashes and pops back past its own size, and a ring plus a short
 * spark burst leaves the button. Unsaving gets the dip and none of the
 * celebration; taking something away should not look like a reward.
 *
 * The fill follows the `favourite` prop rather than the press, so a style
 * unfavourited from another screen animates here too. Only the burst and the
 * haptic are tied to the tap itself.
 */

type Tone = 'light' | 'dark' | 'plain' | 'chip';

interface FavouriteHeartProps {
  favourite?: boolean;
  onToggle?: () => void;
  accessibilityLabel: string;
  /** Diameter of the button. Defaults to the tone's natural size. */
  size?: number;
  tone?: Tone;
  style?: ViewStyle;
}

const TONE_SIZE: Record<Tone, number> = { light: 42, dark: 42, plain: 42, chip: 30 };

const SPARKS = 6;

/**
 * How far the burst is allowed to travel, per tone: how wide the ring gets and
 * how far past the button's edge a spark flies, as a fraction of its width.
 *
 * `chip` is the card's corner button, and the card clips its own bounds — a
 * ring sliced off by the edge of the image reads as a glitch, so that burst is
 * kept inside the corner it sits in.
 */
const BURST: Record<Tone, { ring: number; spark: number }> = {
  light: { ring: 2.1, spark: 0.62 },
  dark: { ring: 2.1, spark: 0.62 },
  plain: { ring: 2.1, spark: 0.62 },
  chip: { ring: 1.5, spark: 0.2 },
};

export function FavouriteHeart({
  favourite,
  onToggle,
  accessibilityLabel,
  size,
  tone = 'light',
  style,
}: FavouriteHeartProps) {
  const diameter = size ?? TONE_SIZE[tone];
  const iconSize = Math.round(diameter * (tone === 'chip' ? 0.54 : 0.45));

  const fill = useRef(new Animated.Value(favourite ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    // The first render is the resting state, not a change to celebrate.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    Animated.spring(fill, {
      toValue: favourite ? 1 : 0,
      useNativeDriver: true,
      damping: favourite ? 7 : 14,
      stiffness: favourite ? 220 : 260,
      mass: 0.7,
    }).start();

    Animated.sequence([
      Animated.timing(pop, {
        toValue: favourite ? 0.78 : 0.9,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: true,
        damping: favourite ? 6 : 12,
        stiffness: 240,
        mass: 0.7,
      }),
    ]).start();
  }, [favourite, fill, pop]);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      // Saving is the heavier of the two: it should feel like the tap landed on
      // something, where letting go is only a release.
      const feedback = favourite
        ? Haptics.selectionAsync()
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      feedback.catch(() => undefined);
    }

    if (!favourite) {
      burst.setValue(0);
      Animated.timing(burst, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    onToggle?.();
  };

  const setPressed = (down: boolean) => {
    Animated.spring(press, {
      toValue: down ? 0.88 : 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
      mass: 0.6,
    }).start();
  };

  const ringScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.55, BURST[tone].ring] });
  const ringOpacity = burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
  const sparkOpacity = burst.interpolate({ inputRange: [0, 0.1, 0.62, 1], outputRange: [0, 1, 0.9, 0] });
  const outlineOpacity = fill.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const filledScale = fill.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!favourite }}
      hitSlop={8}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      <Animated.View
        style={[
          styles.button,
          toneStyle(tone),
          { width: diameter, height: diameter, borderRadius: diameter / 2 },
          { transform: [{ scale: press }, { scale: pop }] },
        ]}
      >
        {/* The ring and the sparks leave the button, so they are drawn over it
            rather than inside its flow, and never take a touch. */}
        <View style={styles.overlay} pointerEvents="none">
          <Animated.View
            style={[
              styles.ring,
              {
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          {Array.from({ length: SPARKS }, (_, index) => {
            const angle = (index / SPARKS) * Math.PI * 2 - Math.PI / 2;
            const reach = diameter * (0.5 + BURST[tone].spark);
            return (
              <Animated.View
                key={index}
                style={[
                  styles.spark,
                  {
                    opacity: sparkOpacity,
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.cos(angle) * reach],
                        }),
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.sin(angle) * reach],
                        }),
                      },
                      {
                        scale: burst.interpolate({
                          inputRange: [0, 0.35, 1],
                          outputRange: [0.4, 1, 0.3],
                        }),
                      },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Outline and fill are stacked rather than swapped, so the filled heart
            springs in over an outline that stays where it is. */}
        <Animated.View style={{ opacity: outlineOpacity }}>
          <Ionicons name="heart-outline" size={iconSize} color={outlineTint(tone)} />
        </Animated.View>
        <Animated.View
          style={[styles.fillLayer, { opacity: fill, transform: [{ scale: filledScale }] }]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={iconSize} color={colors.accent} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function toneStyle(tone: Tone): ViewStyle {
  switch (tone) {
    case 'dark':
      return { backgroundColor: 'rgba(255,255,255,0.16)' };
    case 'plain':
      return { backgroundColor: 'transparent' };
    case 'chip':
      return { backgroundColor: 'rgba(255,255,255,0.92)' };
    default:
      return { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline };
  }
}

function outlineTint(tone: Tone): string {
  if (tone === 'dark') return colors.onDark;
  return tone === 'chip' ? colors.inkSoft : colors.ink;
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  spark: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  fillLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
