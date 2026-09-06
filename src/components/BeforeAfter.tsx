import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DemoSubject, PhotoFrame } from '@/components/PhotoFrame';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

/** Stops either photo being wiped away entirely — there is always a sliver of both. */
const MIN_RATIO = 0.04;
const MAX_RATIO = 0.96;

/**
 * How close to the split a touch has to land to count as grabbing the handle.
 *
 * Inside it the wipe tracks the finger *relative* to where the split already
 * was, so picking the handle up by its edge does not snap it 20 points sideways
 * first. Outside it the split jumps to the finger, which is what makes pressing
 * the far side of the photo a way to see that side whole.
 */
const HANDLE_GRAB = 36;

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

/**
 * Draggable split view comparing the original photo with the generated look.
 *
 * **The split is a shared value rather than state, and that is the whole reason
 * the drag stays under the finger.** It used to be `useState`, written on every
 * `PanResponder` move, so each frame of a wipe reconciled this component and
 * both `<PhotoFrame>`s under it — one an `expo-image`, the other potentially a
 * `<Mannequin>`, which is an SVG carrying a masked colour grade. That is a full
 * React render per touch event, on the same thread that has to accept the next
 * touch event, and it reads as a handle that lags and sticks.
 *
 * Nothing here re-renders during a drag: the gesture and the three animated
 * styles run on the UI thread, so the split keeps up even while JS is busy.
 * `width` is still state because the clipped copy's layout genuinely depends on
 * it — it changes on rotation, not on drag.
 */
export function BeforeAfter({
  beforeUri,
  afterUri,
  height,
  beforeTint = null,
  afterTint = null,
  beforeDemo,
  afterDemo,
}: BeforeAfterProps) {
  const styles = useStyles();
  const colors = useColors();
  const [width, setWidth] = useState(0);
  /** The split as a fraction, so a rotation moves it rather than resetting it. */
  const ratio = useSharedValue(0.5);
  const frameWidth = useSharedValue(0);
  /** Finger-to-split distance, held for the length of one drag. See `HANDLE_GRAB`. */
  const grabOffset = useSharedValue(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.width;
      frameWidth.value = next;
      setWidth(next);
    },
    [frameWidth],
  );

  const gesture = useMemo(() => {
    const clamp = (px: number) => {
      'worklet';
      if (!frameWidth.value) return ratio.value;
      return Math.max(MIN_RATIO, Math.min(MAX_RATIO, px / frameWidth.value));
    };

    // The photo sits inside the page's scroll view, so the wipe waits for a few
    // points of *horizontal* travel before claiming the touch. Without that
    // threshold every attempt to scroll past the comparison wiped it instead.
    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .onStart((event) => {
        const split = frameWidth.value * ratio.value;
        grabOffset.value = Math.abs(event.x - split) <= HANDLE_GRAB ? split - event.x : 0;
      })
      .onUpdate((event) => {
        ratio.value = clamp(event.x + grabOffset.value);
      });

    // A tap is not a drag and never activates the pan, but landing the split
    // where the user pressed is the quickest way to see one side whole.
    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((event) => {
        ratio.value = withTiming(clamp(event.x), { duration: 160 });
      });

    return Gesture.Exclusive(pan, tap);
  }, [frameWidth, grabOffset, ratio]);

  /**
   * The clipped "before" half, done with two opposed transforms rather than an
   * animated `width`: sliding the clipping window left by the hidden amount puts
   * its right edge on the split, and sliding its contents back by the same
   * amount leaves the photograph where it was. Transforms are drawn without a
   * layout pass, which is the point — an animated `width` re-lays-out the
   * subtree every frame. The window's left edge runs off the frame and
   * `styles.wrap`'s own `overflow: hidden` deals with it.
   */
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(frameWidth.value * (1 - ratio.value)) }],
  }));
  const clipContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frameWidth.value * (1 - ratio.value) }],
  }));
  const splitStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: frameWidth.value * ratio.value }],
  }));

  const demoWidth = Math.min((width || 1) * 1.05, height * 0.8);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.wrap, { height }]} onLayout={onLayout}>
        <PhotoFrame
          uri={afterUri}
          tint={afterTint}
          rounded={radii.xl}
          style={StyleSheet.absoluteFill}
          demo={afterDemo}
          demoWidth={demoWidth}
        />

        {/* The "before" half is clipped to the left of the handle. */}
        <Animated.View style={[styles.clip, { width: width || 1 }, clipStyle]}>
          <Animated.View style={clipContentStyle}>
            <PhotoFrame
              uri={beforeUri}
              tint={beforeTint}
              rounded={0}
              style={{ width: width || 1, height }}
              emptyLabel="Original"
              demo={beforeDemo}
              demoWidth={demoWidth}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.divider, splitStyle, { pointerEvents: 'none' }]} />
        <Animated.View style={[styles.handle, splitStyle, { pointerEvents: 'none' }]}>
          <Ionicons name="code-outline" size={18} color={colors.ink} />
        </Animated.View>

        <View style={[styles.tag, { left: spacing.md, pointerEvents: 'none' }]}>
          <Text style={[type.overline, { color: colors.onDark }]}>BEFORE</Text>
        </View>
        <View style={[styles.tag, { right: spacing.md, pointerEvents: 'none' }]}>
          <Text style={[type.overline, { color: colors.onDark }]}>AFTER</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  wrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  clip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  // `left` centres each of these on the split; the transform supplies the split.
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -1,
    width: 2,
    backgroundColor: colors.onDark,
    opacity: 0.9,
  },
  handle: {
    position: 'absolute',
    top: '50%',
    left: -20,
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.onDark,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.2)',
  },
  tag: {
    position: 'absolute',
    top: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(22,18,31,0.6)',
  },
}));
