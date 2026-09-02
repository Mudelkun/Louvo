import React, { useId } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors, type } from '@/theme/theme';

export function ProgressRing({
  progress,
  size = 190,
  strokeWidth = 12,
  trackColor = colors.surfaceSunken,
  labelStyle,
}: {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Unfilled part of the ring — override when the ring sits on a dark tile. */
  trackColor?: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`ring${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} />
            <Stop offset="1" stopColor="#FF9A6C" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#ring${uid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[type.display, { color: colors.ink }, labelStyle]}>{Math.round(clamped * 100)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
