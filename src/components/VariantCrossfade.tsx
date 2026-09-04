import React from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

import type { VariantId } from '@/api/types';
import type { VariantCycle } from '@/hooks/useVariantCycle';

interface VariantCrossfadeProps {
  /** The beat this is drawing, from `useVariantCycle()`. */
  cycle: VariantCycle;
  /** The candidate list to draw when nothing is cycling — the caller's normal one. */
  fallback: VariantId[] | null;
  /** Draws one render. Called twice during a fade, once the rest of the time. */
  children: (variants: VariantId[] | null) => React.ReactNode;
  style?: ViewStyle;
}

/**
 * Dissolves between two renders of the same cut.
 *
 * Only the top layer moves: the outgoing render sits underneath at full opacity
 * while the incoming one fades in over it. Cross-fading both instead would take
 * the pair through a half-transparent middle, and a dip to the surface colour
 * partway through every change reads as a blink rather than as a dissolve.
 *
 * The outgoing render is a normal child and the incoming one is laid over it
 * absolutely, so the wrapper is sized by the artwork exactly as the single
 * uncycled render sizes it. That is what lets this drop into a fixed-height card
 * and into a pager page that sizes itself, without either caller having to
 * describe its layout twice.
 *
 * `useVariantCycle` drops `previous` once a fade has landed, so the second layer
 * exists only while it is visible rather than for the life of the screen.
 */
export function VariantCrossfade({ cycle, fallback, children, style }: VariantCrossfadeProps) {
  const top = cycle.current ? [cycle.current] : fallback;

  if (!cycle.previous) return <View style={style}>{children(top)}</View>;

  return (
    <View style={style}>
      {children([cycle.previous])}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: cycle.fade }]}>{children(top)}</Animated.View>
    </View>
  );
}
