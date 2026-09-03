import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';

import { DemoSubject, PhotoFrame } from '@/components/PhotoFrame';
import { colors, radii, spacing, type } from '@/theme/theme';

interface BeforeAfterProps {
  beforeUri: string | null;
  afterUri: string | null;
  height: number;
  /**
   * Washes laid over each half, and **null is the right answer for a real
   * preview**.
   *
   * They are the simulation's device: when the "after" was the same photograph
   * as the "before", a warm wash on one side and a cool one on the other were
   * the only thing that made the wipe look like a wipe. Against an image the
   * model actually changed they do the opposite of their job — a flat 10% orange
   * over the whole frame is a colour cast on skin, clothes and hair alike, and
   * the hair is where it reads worst, because that is the one thing the user is
   * examining. It also disguises a simulated look as an edit.
   *
   * So they default to nothing and the caller opts in for a simulated look only,
   * which is what `result.tsx` and this screen's side-by-side mode already do.
   */
  beforeTint?: string | null;
  afterTint?: string | null;
  /** What to draw on each side when the sample photo is in use. */
  beforeDemo?: DemoSubject;
  afterDemo?: DemoSubject;
}

/** Draggable split view comparing the original photo with the generated look. */
export function BeforeAfter({
  beforeUri,
  afterUri,
  height,
  beforeTint = null,
  afterTint = null,
  beforeDemo,
  afterDemo,
}: BeforeAfterProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const [ratio, setRatio] = useState(0.5);
  const grantX = useRef(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const commit = useCallback((x: number) => {
    if (!widthRef.current) return;
    setRatio(Math.max(0.04, Math.min(0.96, x / widthRef.current)));
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          grantX.current = event.nativeEvent.locationX;
          commit(grantX.current);
        },
        onPanResponderMove: (_event, gesture) => commit(grantX.current + gesture.dx),
      }),
    [commit],
  );

  const splitX = width * ratio;

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout} {...responder.panHandlers}>
      <PhotoFrame
        uri={afterUri}
        tint={afterTint}
        rounded={radii.xl}
        style={StyleSheet.absoluteFill}
        demo={afterDemo}
        demoWidth={Math.min((width || 1) * 1.05, height * 0.8)}
      />

      {/* The "before" half is clipped to the left of the handle. */}
      <View style={[styles.clip, { width: splitX }]}>
        <PhotoFrame
          uri={beforeUri}
          tint={beforeTint}
          rounded={0}
          style={{ width: width || 1, height }}
          emptyLabel="Original"
          demo={beforeDemo}
          demoWidth={Math.min((width || 1) * 1.05, height * 0.8)}
        />
      </View>

      <View pointerEvents="none" style={[styles.divider, { left: splitX - 1 }]} />
      <View pointerEvents="none" style={[styles.handle, { left: splitX - 20 }]}>
        <Ionicons name="code-outline" size={18} color={colors.ink} />
      </View>

      <View pointerEvents="none" style={[styles.tag, { left: spacing.md }]}>
        <Text style={[type.overline, { color: colors.onDark }]}>BEFORE</Text>
      </View>
      <View pointerEvents="none" style={[styles.tag, { right: spacing.md }]}>
        <Text style={[type.overline, { color: colors.onDark }]}>AFTER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  clip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  divider: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.onDark, opacity: 0.9 },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.onDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tag: {
    position: 'absolute',
    top: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(23,21,26,0.6)',
  },
});
