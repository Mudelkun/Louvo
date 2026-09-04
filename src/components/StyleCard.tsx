import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import type { Gender, HairColor, HairTypeId, Hairstyle, VariantId } from '@/api/types';
import { FavouriteHeart } from '@/components/FavouriteHeart';
import { Mannequin } from '@/components/Mannequin';
import { VariantCrossfade } from '@/components/VariantCrossfade';
import { useVariantCycle } from '@/hooks/useVariantCycle';
import { HERO_ANGLE } from '@/lib/hairShape';
import { textureFor, typesForVariant, variantCandidates } from '@/lib/hairTypes';
import { renderedVariants } from '@/lib/mannequinRender';
import { useCatalog } from '@/state/CatalogContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

interface StyleCardProps {
  hairstyle: Hairstyle;
  color?: HairColor | null;
  /** Picks the male or female render when the style has both. */
  gender?: Gender | null;
  /**
   * The hair type the grid is being browsed as, or null for "All Types". Picks
   * which render of this cut the card shows, and which texture the fallback
   * drawing is drawn in.
   *
   * Under "All Types" it picks *all* of them — see the cycle below.
   */
  hairType?: HairTypeId | null;
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
  hairType,
  onPress,
  onToggleFavourite,
  favourite,
  selected,
  width,
  compact,
  style,
}: StyleCardProps) {
  const { hairTypes } = useCatalog();
  const imageHeight = compact ? width * 0.94 : width * 1.02;
  const shape = { ...hairstyle.shape, texture: textureFor(hairstyle, hairType) };
  const candidates = variantCandidates(hairstyle, hairType);

  /**
   * Under "All Types" the card shows every render this cut has, in turn.
   *
   * With a type declared there is one honest image and the card shows it. With
   * none declared `variantCandidates()` hands back the whole set and the card
   * used to take the first of them and stop — so a cut generated in three
   * textures looked exactly like a cut generated in one, and the only way to
   * find out otherwise was to open it. Cycling says it on the grid instead.
   *
   * Only renders that exist and differ are cycled (`renderedVariants()`), so
   * this is silent for a style with a single render and for the whole women's
   * catalog until its second hair type is shot. The procedural drawing is never
   * cycled either: under "All Types" it is drawn in the style's own texture
   * whichever variant is asked for, so there would be nothing to see.
   *
   * Every cycling card in the grid changes on the same beat — one clock for all
   * of them, in `useVariantCycle`. Each still starts from its own first render,
   * so what they have in common is the moment, not the image.
   */
  const cycle = useVariantCycle(hairType ? [] : renderedVariants(hairstyle.id, gender, HERO_ANGLE, candidates));

  const mannequinFor = (variants: VariantId[] | null) => (
    <Mannequin
      styleId={hairstyle.id}
      shape={shape}
      color={color}
      gender={gender}
      variants={variants}
      angle={HERO_ANGLE}
      size={width}
      backdrop={null}
    />
  );

  /** Which hair types the render on screen stands in for, named from the catalog. */
  const labelFor = (variant: VariantId) =>
    typesForVariant(hairstyle, variant)
      .map((id) => hairTypes.find((entry) => entry.id === id)?.name)
      .filter(Boolean)
      .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hairstyle.name}
      accessibilityHint={cycle.cycling ? 'Shown in more than one hair type' : undefined}
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
        ) : cycle.cycling ? (
          <>
            <VariantCrossfade cycle={cycle} fallback={candidates}>
              {(variants) => mannequinFor(variants)}
            </VariantCrossfade>

            {/* The images alone say there is more than one version of the cut;
                the caption says which one is on screen. Unlike the renders,
                these two must not overlap — two words dissolving through each
                other is unreadable — so they hand over in sequence inside the
                same fade. */}
            {cycle.previous ? (
              <Animated.View
                style={[
                  styles.variantTag,
                  {
                    opacity: cycle.fade.interpolate({
                      inputRange: [0, 0.45],
                      outputRange: [1, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              >
                <Text style={[type.caption, styles.variantTagText]} numberOfLines={1}>
                  {labelFor(cycle.previous)}
                </Text>
              </Animated.View>
            ) : null}
            {cycle.current ? (
              <Animated.View
                style={[
                  styles.variantTag,
                  {
                    opacity: cycle.previous
                      ? cycle.fade.interpolate({
                          inputRange: [0.55, 1],
                          outputRange: [0, 1],
                          extrapolate: 'clamp',
                        })
                      : 1,
                  },
                ]}
              >
                <Text style={[type.caption, styles.variantTagText]} numberOfLines={1}>
                  {labelFor(cycle.current)}
                </Text>
              </Animated.View>
            ) : null}
          </>
        ) : (
          mannequinFor(candidates)
        )}

        {onToggleFavourite ? (
          <FavouriteHeart
            accessibilityLabel={favourite ? `Remove ${hairstyle.name} from favourites` : `Save ${hairstyle.name}`}
            favourite={favourite}
            onToggle={onToggleFavourite}
            tone="chip"
            style={styles.heart}
          />
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
  heart: { position: 'absolute', top: spacing.sm, right: spacing.sm },
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
  // Bottom left, where neither the heart nor the selected tick can reach it.
  variantTag: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    maxWidth: '82%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  variantTagText: { color: colors.inkSoft, fontWeight: '700' },
  meta: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 2 },
});
