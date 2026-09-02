import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { recommendationsFor } from '@/api/client';
import { Button, IconButton } from '@/components/Button';
import { EmptyState, Pill } from '@/components/Feedback';
import { MannequinBadge } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor, useLookColor } from '@/hooks/useHairColor';
import { useLookDownload } from '@/hooks/useLookDownload';
import { DEMO_PHOTO } from '@/lib/constants';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const STAGE_WIDTH = width - spacing.xl * 2;
const STAGE_HEIGHT = STAGE_WIDTH * 1.28;
/** Cards in the "try next" rail — narrow enough that the next one peeks in. */
const RAIL_CARD_WIDTH = Math.min(136, (width - spacing.xl * 2 - spacing.md * 2) / 2.4);

export default function ResultScreen() {
  const router = useRouter();
  const { hairstyles, styleById } = useCatalog();
  const { look, gender, restartStyleChoice } = useSession();
  const lookColor = useLookColor(look);
  const browsingColor = useHairColor();
  const { isFavourite, toggleFavourite, favouriteIds } = useLibrary();
  /**
   * Downloading is its own action, not library membership — every finished look
   * is written to the library by `GenerationProvider`, so that flag would read
   * "Downloaded" before the user had touched anything.
   */
  const download = useLookDownload(look?.resultUri);

  const hairstyle = styleById(look?.hairstyleId);

  const related = useMemo(
    () => recommendationsFor(hairstyles, hairstyle?.id ?? '', gender, 8),
    [hairstyles, hairstyle?.id, gender],
  );

  if (!look || !hairstyle) {
    return (
      <Screen>
        <Header title="Your look" />
        <EmptyState
          icon="image-outline"
          title="No preview yet"
          body="Generate a look and it will show up here."
          actionLabel="Start a try-on"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const favourite = isFavourite(hairstyle.id);

  const openStyle = (id: string) => {
    restartStyleChoice();
    router.push(`/try/style/${id}`);
  };

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label="Try another style"
          icon="repeat-outline"
          onPress={() => router.push(`/try/more-styles?from=${hairstyle.id}`)}
        />
      }
    >
      <Header
        title="Your new look"
        right={
          <IconButton
            icon={favourite ? 'heart' : 'heart-outline'}
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            active={favourite}
            onPress={() => toggleFavourite(hairstyle.id)}
          />
        }
      />

      <View style={styles.stage}>
        <PhotoFrame
          uri={look.resultUri}
          tint={look.resultUri && look.resultUri !== DEMO_PHOTO ? 'rgba(255,90,60,0.08)' : null}
          style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          demo={{ styleId: hairstyle.id, shape: hairstyle.shape, color: lookColor, gender }}
          demoWidth={STAGE_HEIGHT * 0.8}
        >
          <View style={styles.styleTag}>
            <MannequinBadge
              styleId={hairstyle.id}
              shape={hairstyle.shape}
              color={lookColor}
              gender={gender}
              size={34}
            />
            <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]}>
              {hairstyle.name}
            </Text>
          </View>
        </PhotoFrame>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.pillRow}>
          <Pill tone="jade" label="Simulated preview" />
        </View>

        <View style={styles.actionRow}>
          <ResultAction
            icon={download.status === 'done' ? 'checkmark-circle' : 'download-outline'}
            label={
              download.status === 'done' ? 'Saved' : download.status === 'busy' ? 'Saving…' : 'Download'
            }
            active={download.status === 'done'}
            onPress={download.download}
          />
          <ResultAction icon="share-social-outline" label="Share" onPress={() => router.push('/try/share')} />
          <ResultAction icon="git-compare-outline" label="Compare" onPress={() => router.push('/try/compare')} />
        </View>

        {related.length ? (
          <View>
            <SectionLabel>Try these next</SectionLabel>
            <View style={styles.railBleed}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              >
                {related.map((style) => (
                  <StyleCard
                    key={style.id}
                    hairstyle={style}
                    width={RAIL_CARD_WIDTH}
                    compact
                    color={browsingColor}
                    gender={gender}
                    favourite={favouriteIds.includes(style.id)}
                    onToggleFavourite={() => toggleFavourite(style.id)}
                    onPress={() => openStyle(style.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        <View style={styles.explainer}>
          <Ionicons name="information-circle-outline" size={17} color={colors.inkSoft} />
          <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
            Image generation is not connected yet, so this shows your original photo with the chosen
            style recorded against it. The layout, actions and flow are final.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function ResultAction({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={21} color={active ? colors.jade : colors.ink} />
      <Text style={[type.caption, { color: active ? colors.jade : colors.inkSoft, fontWeight: '700' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: spacing.lg },
  styleTag: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(23,21,26,0.72)',
    borderRadius: radii.pill,
    paddingLeft: 6,
    paddingRight: spacing.lg,
    paddingVertical: 6,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  // The rail runs edge to edge, so it cancels the section gutter.
  railBleed: { marginHorizontal: -spacing.xl },
  railContent: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: 4 },
  explainer: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
});
