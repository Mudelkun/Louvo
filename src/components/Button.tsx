import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { makeStyles, radii, spacing, useColors, useShadow, useTheme, type Palette, type } from '@/theme/theme';

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'dark';
type Size = 'lg' | 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
}

const HEIGHTS: Record<Size, number> = { lg: 56, md: 46, sm: 36 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  disabled,
  loading,
  full = true,
  style,
}: ButtonProps) {
  const styles = useStyles();
  const shadow = useShadow();
  const variantStyles = useVariantStyles();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={label}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHTS[size] },
        full && styles.full,
        variantStyles[variant].container,
        variant === 'primary' && !isDisabled && shadow.card,
        pressed && !isDisabled && variantStyles[variant].pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={variantStyles[variant].text.color} /> : null}
          <Text
            style={[
              size === 'sm' ? type.label : type.bodyStrong,
              variantStyles[variant].text,
              size === 'lg' && { fontSize: 16 },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconRight ? (
            <Ionicons name={iconRight} size={size === 'sm' ? 15 : 18} color={variantStyles[variant].text.color} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  base: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disabled: { opacity: 0.42 },
}));

/**
 * The five fills, and the two pairs that stopped being interchangeable once
 * there was a second scheme.
 *
 * `primary` is brass with `onAccent` on it, and `dark` is the neutral fill with
 * `onInkFill` — both of which invert after dark, where the brass goes bright
 * and the neutral fill goes bone. Writing either as `onDark` would have been
 * right in one scheme and white-on-white in the other. `soft` takes `accentInk`
 * rather than `accent` for the same reason: the label on a brass-tinted panel
 * has to move to the opposite end of the brass ramp from the panel itself.
 */
type Variants = Record<Variant, { container: ViewStyle; pressed: ViewStyle; text: { color: string } }>;

function variantsFor(colors: Palette): Variants {
  return {
    primary: {
      container: { backgroundColor: colors.accent },
      pressed: { backgroundColor: colors.accentPressed, transform: [{ scale: 0.985 }] },
      text: { color: colors.onAccent },
    },
    dark: {
      container: { backgroundColor: colors.inkFill },
      pressed: { backgroundColor: colors.inkPressed, transform: [{ scale: 0.985 }] },
      text: { color: colors.onInkFill },
    },
    secondary: {
      container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairlineStrong },
      pressed: { backgroundColor: colors.surfaceAlt },
      text: { color: colors.ink },
    },
    soft: {
      container: { backgroundColor: colors.accentSoft },
      pressed: { backgroundColor: colors.accentSoftPressed },
      text: { color: colors.accentInk },
    },
    ghost: {
      container: { backgroundColor: 'transparent' },
      pressed: { backgroundColor: colors.surfaceAlt },
      text: { color: colors.inkSoft },
    },
  };
}

const VARIANTS: Record<string, Variants> = {};

function useVariantStyles(): Variants {
  const { name, colors } = useTheme();
  if (!VARIANTS[name]) VARIANTS[name] = variantsFor(colors);
  return VARIANTS[name];
}

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  active?: boolean;
  tone?: 'light' | 'dark' | 'plain';
  size?: number;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  active,
  tone = 'light',
  size = 42,
  style,
}: IconButtonProps) {
  const colors = useColors();
  const background =
    tone === 'dark' ? 'rgba(255,255,255,0.16)' : tone === 'plain' ? 'transparent' : colors.surface;
  const tint = active ? colors.accent : tone === 'dark' ? colors.onDark : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: tone === 'light' ? 1 : 0,
          borderColor: colors.hairline,
        },
        pressed && { opacity: 0.6 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.45} color={tint} />
    </Pressable>
  );
}
