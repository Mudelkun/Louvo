import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radii, spacing, type } from '@/theme/theme';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
};

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export function Chip({
  label,
  selected,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? colors.onDark : colors.inkSoft} /> : null}
      <Text style={[type.label, { color: selected ? colors.onDark : colors.inkSoft }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({
  items,
  value,
  onChange,
  contentPaddingHorizontal = spacing.xl,
}: {
  items: { id: string; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: string | null;
  onChange: (id: string) => void;
  contentPaddingHorizontal?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: contentPaddingHorizontal }}
    >
      {items.map((item) => (
        <Chip
          key={item.id}
          label={item.label}
          icon={item.icon}
          selected={value === item.id}
          onPress={() => onChange(item.id)}
        />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Colour swatches
// ---------------------------------------------------------------------------

export function SwatchRow({
  items,
  value,
  onChange,
  contentPaddingHorizontal = spacing.xl,
}: {
  items: { id: string; name: string; hex: string }[];
  value: string | null;
  onChange: (id: string) => void;
  contentPaddingHorizontal?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: contentPaddingHorizontal }}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            // The swatch is the colour, so the name has to be spoken for it.
            accessibilityLabel={item.name}
            accessibilityState={{ selected }}
            onPress={() => {
              tap();
              onChange(item.id);
            }}
            style={({ pressed }) => [
              styles.swatchOuter,
              selected && { borderColor: colors.accent },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.swatch, { backgroundColor: item.hex }]}>
              {selected ? <Ionicons name="checkmark" size={16} color={colors.onDark} /> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Segmented choice
// ---------------------------------------------------------------------------

export function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              tap();
              onChange(option.id);
            }}
            style={({ pressed }) => [
              styles.segmentItem,
              selected && styles.segmentItemSelected,
              pressed && !selected && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Text style={[type.label, { color: selected ? colors.onDark : colors.inkSoft }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  }, []);

  const commit = useCallback(
    (x: number) => {
      if (!widthRef.current) return;
      const ratio = Math.max(0, Math.min(1, x / widthRef.current));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, snapped));
      if (clamped !== valueRef.current) {
        valueRef.current = clamped;
        tap();
        onChange(clamped);
      }
    },
    [min, max, step, onChange],
  );

  // `locationX` is only reliable on the initial touch, so the drag is tracked as
  // an offset from where the finger landed on the track.
  const grantX = useRef(0);
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

  const ratio = max === min ? 0 : (value - min) / (max - min);

  return (
    <View>
      <View style={styles.sliderHeaderRow}>
        {label ? <Text style={[type.caption, { color: colors.muted }]}>{label}</Text> : <View />}
        <Text style={[type.label, { color: colors.ink }]}>{Math.round(value)}%</Text>
      </View>
      <View
        style={styles.sliderTouch}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, now: value }}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: Math.max(0, ratio * width) }]} />
        </View>
        <View style={[styles.sliderThumb, { left: Math.max(0, ratio * width - 13) }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemSelected: { backgroundColor: colors.ink },
  swatchOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  sliderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sliderTouch: { height: 40, justifyContent: 'center' },
  sliderTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  sliderFill: { height: 6, backgroundColor: colors.accent, borderRadius: radii.pill },
  sliderThumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
