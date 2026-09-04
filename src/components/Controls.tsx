import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ImageSourcePropType,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
// Filter select
//
// A whole dimension of the catalog collapsed into one control that states its
// current answer and opens its options only when asked. The catalog used to
// carry two chip rows — every option of both dimensions on screen at once,
// above the grid that is the actual content — and this is the same filtering
// with the options put away.
//
// The first option is the neutral one ("All", "All types", the default sort):
// while it is selected the control shows `placeholder` and reads as unset, and
// any other choice tints it, so an active filter is visible without listing
// what was not chosen.
// ---------------------------------------------------------------------------

export interface SelectOption {
  id: string;
  label: string;
  /**
   * Optional picture of what the option means, shown in the sheet beside its
   * label. The hair-type filter carries the picker's generated example of each
   * texture through it, so the question "which of these is my hair" is answered
   * the same way here as it was on `app/try/hair-type.tsx`.
   *
   * A list is illustrated or it is not: as soon as one option carries an image
   * every row gets a tile of the same size, and the ones with nothing to show
   * (the neutral "All" at the top) get the control's own icon in it rather than
   * a hole in the column.
   */
  image?: ImageSourcePropType;
}

export function FilterSelect({
  placeholder,
  icon,
  options,
  value,
  onChange,
  variant = 'pill',
  style,
}: {
  placeholder: string;
  icon?: keyof typeof Ionicons.glyphMap;
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  /** `plain` drops the pill and is used where the control sits inline in a row. */
  variant?: 'pill' | 'plain';
  style?: ViewStyle;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const neutral = !selected || selected.id === options[0]?.id;
  const label = neutral ? placeholder : (selected as SelectOption).label;
  const tint = neutral ? colors.inkSoft : colors.accentInk;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={neutral ? placeholder : `${placeholder}: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={({ pressed }) => [
          variant === 'pill' ? styles.select : styles.selectPlain,
          variant === 'pill' && !neutral && styles.selectActive,
          pressed && { opacity: 0.75 },
          style,
        ]}
      >
        {icon ? <Ionicons name={icon} size={16} color={neutral ? colors.inkSoft : colors.accent} /> : null}
        <Text
          style={[type.label, variant === 'pill' && { flex: 1 }, { color: tint }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={15} color={neutral ? colors.muted : colors.accent} />
      </Pressable>

      <SelectSheet
        title={placeholder}
        icon={icon}
        open={open}
        options={options}
        value={value}
        onClose={() => setOpen(false)}
        onChoose={(id) => {
          tap();
          setOpen(false);
          onChange(id);
        }}
      />
    </>
  );
}

function SelectSheet({
  title,
  icon,
  open,
  options,
  value,
  onClose,
  onChoose,
}: {
  title: string;
  /** Stands in for any option that has no image of its own. */
  icon?: keyof typeof Ionicons.glyphMap;
  open: boolean;
  options: SelectOption[];
  value: string;
  onClose: () => void;
  onChoose: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const illustrated = options.some((option) => option.image);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetGrabber} />
          <Text style={[type.heading, styles.sheetTitle]}>{title}</Text>
          {options.map((option) => {
            const selected = option.id === value;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChoose(option.id)}
                style={({ pressed }) => [
                  styles.sheetRow,
                  illustrated && styles.sheetRowIllustrated,
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                {illustrated ? (
                  option.image ? (
                    <Image
                      source={option.image}
                      style={[styles.sheetThumb, selected && styles.sheetThumbSelected]}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={[styles.sheetThumb, styles.sheetThumbEmpty]}>
                      {icon ? (
                        <Ionicons
                          name={icon}
                          size={18}
                          color={selected ? colors.accent : colors.muted}
                        />
                      ) : null}
                    </View>
                  )
                ) : null}
                <Text style={[type.body, { flex: 1, color: selected ? colors.accentInk : colors.ink }]}>
                  {option.label}
                </Text>
                {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Colour swatches
//
// Nothing renders this at the moment — the colour picker is out of the UI while
// the catalog settles on one shade. Kept because the grade behind it is live
// (`src/lib/colorGrade.ts`) and putting the choice back is this row plus the
// session's `setColor`.
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
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  selectActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  selectPlain: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: spacing.xs },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
    marginBottom: spacing.lg,
  },
  sheetTitle: { color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  sheetRowIllustrated: { gap: spacing.lg, paddingVertical: spacing.sm },
  /**
   * A rounded square rather than a circle, and the same size the hair-type
   * picker uses: these are heads of hair, and a circle crops the silhouette the
   * row is there to show.
   */
  sheetThumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
  },
  sheetThumbSelected: { borderColor: colors.accent },
  sheetThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
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
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
  },
});
