import React, { useEffect, useMemo } from 'react';
import { Animated, DimensionValue, Easing, View, ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NATIVE_DRIVER } from '@/lib/motion';
import { radii, useColors } from '@/theme/theme';

/**
 * The placeholder the app waits behind, in place of a spinner.
 *
 * A spinner says only "something is happening". A skeleton says *what* is
 * coming: the catalog's loading state is a grid of cards the size of the cards
 * that are about to land, so the page is already the right shape when the data
 * arrives and nothing jumps. That is the whole reason for it — the wait is not
 * shorter, it is legible, and a wait somebody can read the end of is one they
 * will sit through.
 *
 * The rule the placeholders are held to is the same one the generating screen
 * is held to: **never claim anything that is not true.** A skeleton stands where
 * content will actually be, in the count the layout will actually have (six
 * cards, four hair types, one hero), and it carries no progress of any kind —
 * there is nothing to report while a fetch is in flight, and a bar creeping
 * across a placeholder would be the invention that screen exists not to make.
 */

/**
 * The beat every placeholder pulses on — one clock for the whole screen rather
 * than a timer per block, for the reason `useVariantCycle` shares its own: a
 * dozen blocks mounting a frame apart would each start their own loop from
 * their own mount and fan out into a shimmer that reads as noise. Shared, the
 * page breathes as one object.
 *
 * The loop runs only while something is subscribed to it, so a screen with
 * nothing loading on it has no animation running at all.
 */
const PULSE_MS = 900;
const pulse = new Animated.Value(0);
let subscribers = 0;
let animation: Animated.CompositeAnimation | null = null;

function subscribe() {
  subscribers += 1;
  if (subscribers === 1) {
    pulse.setValue(0);
    animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          // The same gentle S-curve as the variant cross-fade: neither end of
          // the breath has an edge on it, so the page never appears to blink.
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    animation.start();
  }
  return () => {
    subscribers -= 1;
    if (subscribers) return;
    animation?.stop();
    animation = null;
    pulse.setValue(0);
  };
}

/**
 * The opacity a placeholder block is drawn at — a live value, or a flat one
 * under reduced motion, where the blocks simply sit there being the shape of
 * what is coming. That is not a degraded skeleton: the shape was always the
 * part doing the work.
 */
function usePulse(): Animated.AnimatedInterpolation<number> | number {
  const reduced = useReducedMotion();

  useEffect(() => (reduced ? undefined : subscribe()), [reduced]);

  return useMemo(
    () =>
      reduced
        ? 1
        : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
    [reduced],
  );
}

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * One placeholder block. Everything below is these, arranged.
 *
 * One grey for all of them, a step below the canvas: a placeholder that changed
 * tone with what it sits on would have to be told, at every call site, which
 * ground it is on — and the two greys are close enough that getting it wrong
 * looks like a bug rather than like a choice.
 */
export function Skeleton({ width, height = 12, radius = radii.sm, style }: SkeletonProps) {
  const colors = useColors();
  const opacity = usePulse();
  return (
    <Animated.View
      // The group announces the wait; the blocks inside it are decoration and
      // must not be read out one at a time.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { backgroundColor: colors.surfaceSunken },
        { width, height, borderRadius: radius },
        style,
        { opacity },
      ]}
    />
  );
}

/**
 * A line of placeholder text, at the height of the type it stands in for.
 *
 * Lines are deliberately not full width: real text ends where its sentence
 * does, and a stack of edge-to-edge bars reads as a table rather than as prose
 * about to arrive.
 */
export function SkeletonLine({
  width = '100%',
  height = 12,
  style,
}: Omit<SkeletonProps, 'radius' | 'height'> & { height?: number }) {
  return <Skeleton width={width} height={height} radius={height / 2} style={style} />;
}

/**
 * The wrapper that says a wait is happening, once, to anyone who cannot see it.
 *
 * A screen reader given the blocks themselves gets nothing — they are shapes —
 * so the group carries the sentence the spinner's caption used to, and its
 * children are hidden. `busy` is what a screen reader announces the state as.
 */
export function SkeletonGroup({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={style}
    >
      {children}
    </View>
  );
}

