import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { createAnimatedSvg } from '@/components/animatedSvg';
import { NATIVE_DRIVER } from '@/lib/motion';
import { makeStyles, useColors, type } from '@/theme/theme';

const AnimatedCircle = createAnimatedSvg(Circle);

/**
 * Progress, eased.
 *
 * The generator reports every 400ms and, inside a stage, in shrinking
 * asymptotic steps — so a ring bound straight to `progress` steps, then holds
 * still, then steps. A still progress indicator reads as a hung one, which is
 * the moment a user leaves. Tweening each report over slightly longer than the
 * gap between reports means the arc is always moving, without inventing any
 * progress that was not reported.
 *
 * The percentage is state rather than an animated node because text content
 * cannot be animated; it is only pushed when the whole number changes, so this
 * re-renders about a hundred times over a whole generation.
 */
export function useSmoothProgress(target: number): { value: Animated.Value; percent: number } {
  const clamped = Math.max(0, Math.min(1, target));
  const value = useRef(new Animated.Value(clamped)).current;
  const [percent, setPercent] = useState(Math.round(clamped * 100));

  useEffect(() => {
    const id = value.addListener(({ value: v }) => {
      setPercent((prev) => {
        const next = Math.round(Math.max(0, Math.min(1, v)) * 100);
        return next === prev ? prev : next;
      });
    });
    return () => value.removeListener(id);
  }, [value]);

  useEffect(() => {
    const animation = Animated.timing(value, {
      toValue: clamped,
      duration: 520,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [value, clamped]);

  return { value, percent };
}

export function ProgressRing({
  progress,
  size = 190,
  strokeWidth = 12,
  trackColor,
  labelStyle,
  sublabel,
  sublabelStyle,
  /** Set false to use `children` as the centre instead of the percentage. */
  showLabel = true,
  /**
   * The dot riding the head of the arc, breathing.
   *
   * It is the only part of the ring that keeps moving when progress does not,
   * and that is its whole job: it separates "this is slow" from "this is
   * broken" without claiming any progress that has not happened.
   */
  pulse = true,
  children,
}: {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Unfilled part of the ring — override when the ring sits on a dark tile. */
  trackColor?: string;
  labelStyle?: StyleProp<TextStyle>;
  sublabel?: string;
  sublabelStyle?: StyleProp<TextStyle>;
  showLabel?: boolean;
  pulse?: boolean;
  children?: React.ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const { value, percent } = useSmoothProgress(progress);

  const dashOffset = useMemo(
    () => value.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] }),
    [value, circumference],
  );
  const headRotation = useMemo(
    () => value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [value],
  );

  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(breath, { toValue: 0, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, pulse]);

  const headSize = strokeWidth * 1.9;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`ring${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} />
            <Stop offset="1" stopColor={colors.accentGlow} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? colors.surfaceSunken}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#ring${uid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {pulse ? (
        // The dot is drawn outside the Svg so it can breathe on the native
        // driver while the arc itself tweens in JS — one Animated.Value cannot
        // do both, and strokeDashoffset has no native path.
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: headRotation }], pointerEvents: 'none' }]}
        >
          <Animated.View
            style={[
              styles.head,
              {
                width: headSize,
                height: headSize,
                borderRadius: headSize / 2,
                marginTop: strokeWidth / 2 - headSize / 2,
                opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.75] }),
                transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.35] }) }],
              },
            ]}
          />
        </Animated.View>
      ) : null}

      <View style={[StyleSheet.absoluteFill, styles.center, { pointerEvents: 'none' }]}>
        {showLabel ? (
          <>
            <Text style={[type.display, { color: colors.ink }, labelStyle]}>{percent}%</Text>
            {sublabel ? (
              <Text style={[type.caption, { color: colors.muted }, sublabelStyle]}>{sublabel}</Text>
            ) : null}
          </>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  center: { alignItems: 'center', justifyContent: 'center' },
  head: { alignSelf: 'center', backgroundColor: colors.accent },
}));
