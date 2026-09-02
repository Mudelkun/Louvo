import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import type { Gender, HairColor, Hairstyle } from '@/api/types';
import { Mannequin } from '@/components/Mannequin';
import { HERO_ANGLE } from '@/lib/hairShape';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

interface StyleCardProps {
  hairstyle: Hairstyle;
  color?: HairColor;
  /** Picks the male or female render when the style has both. */
  gender?: Gender | null;
  onPress?: () => void;
  onToggleFavourite?: () => void;
  favourite?: boolean;
  selected?: boolean;
  width: number;
  /** Compact cards drop the tag line — used in horizontal rails. */
  compact?: boolean;
  style?: ViewStyle;
}

export function StyleCard({
  hairstyle,
  color,
  gender,
  onPress,
  onToggleFavourite,
  favourite,
  selected,
  width,
  compact,
  style,
}: StyleCardProps) {
  const imageHeight = compact ? width * 0.94 : width * 1.02;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hairstyle.name}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        selected && styles.cardSelected,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        {hairstyle.imageUrl ? (
          // Real AI-generated mannequin renders slot in here once the backend serves them.
          <Image source={{ uri: hairstyle.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Mannequin
            styleId={hairstyle.id}
            shape={hairstyle.shape}
            color={color}
            gender={gender}
            angle={HERO_ANGLE}
            size={width}
            backdrop={null}
          />
        )}

        {onToggleFavourite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favourite ? `Remove ${hairstyle.name} from favourites` : `Save ${hairstyle.name}`}
            hitSlop={8}
            onPress={onToggleFavourite}
            style={styles.heart}
          >
            <Ionicons
              name={favourite ? 'heart' : 'heart-outline'}
              size={16}
              color={favourite ? colors.accent : colors.inkSoft}
            />
          </Pressable>
        ) : null}

        {selected ? (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={13} color={colors.onDark} />
          </View>
        ) : null}
      </View>

      <View style={styles.meta}>
        <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 14 }]} numberOfLines={1}>
          {hairstyle.name}
        </Text>
        {compact ? null : (
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {hairstyle.maintenance} upkeep · {hairstyle.popularity}% liked
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardSelected: { borderColor: colors.accent, borderWidth: 2 },
  imageWrap: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  heart: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 2 },
});
