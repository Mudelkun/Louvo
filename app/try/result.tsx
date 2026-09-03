import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { recommendationsFor } from '@/api/client';
import { Button } from '@/components/Button';
import { FavouriteHeart } from '@/components/FavouriteHeart';
import { EmptyState, Pill } from '@/components/Feedback';
import { MannequinBadge } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor, useLookColor } from '@/hooks/useHairColor';
import { useLookDownload } from '@/hooks/useLookDownload';
import { DEMO_PHOTO } from '@/lib/constants';
import { textureFor, variantCandidates } from '@/lib/hairTypes';
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
  const { look, gender: sessionGender, hairTypeId, restartStyleChoice } = useSession();
  // The look's own gender, not the session's — a look generated from the women's
  // catalog has to keep being drawn on the women's mannequin after the session
  // has moved on, exactly as `look.hairType` and `look.options.color` do below.
  const gender = look?.gender ?? sessionGender;
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
    () => recommendationsFor(hairstyles, hairstyle?.id ?? '', gender, 8, hairTypeId),
    [hairstyles, hairstyle?.id, gender, hairTypeId],
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
  // The look's own type, not the session's: a saved look is a picture of a
  // decision already made, and keeps the hair it was generated for even after
  // the user has switched types to browse something else.
  const lookVariants = variantCandidates(hairstyle, look.hairType);
  const lookShape = { ...hairstyle.shape, texture: textureFor(hairstyle, look.hairType) };

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
          <FavouriteHeart
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            favourite={favourite}
            onToggle={() => toggleFavourite(hairstyle.id)}
          />
        }
      />

      <View style={styles.stage}>
        <PhotoFrame
          uri={look.resultUri}
          // The warm wash was the simulation's way of marking a photo that had
          // been "changed". A generated look really has been, so it is shown as
          // it came back — tinting it would misrepresent the result.
          tint={look.simulated && look.resultUri && look.resultUri !== DEMO_PHOTO ? 'rgba(255,90,60,0.08)' : null}
          style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          demo={{ styleId: hairstyle.id, shape: lookShape, color: lookColor, gender, variants: lookVariants }}
          demoWidth={STAGE_HEIGHT * 0.8}
        >
          {/* The tag names the cut in the picture, so it is the obvious way back
              to that cut's page. It does not clear the style choice the way the
              "try next" rail does — this is the look the user is standing on,
              and dropping it would empty this screen behind them. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${hairstyle.name} details`}
            onPress={() => router.push(`/try/style/${hairstyle.id}`)}
            style={({ pressed }) => [styles.styleTag, pressed && { opacity: 0.75 }]}
          >
            <MannequinBadge
              styleId={hairstyle.id}
              shape={lookShape}
              color={lookColor}
              gender={gender}
              variants={lookVariants}
              size={34}
            />
            <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]}>
              {hairstyle.name}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.onDark} />
          </Pressable>
        </PhotoFrame>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.pillRow}>
          <Pill tone="jade" label={look.simulated ? 'Simulated preview' : 'AI preview'} />
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
                    hairType={hairTypeId}
                    favourite={favouriteIds.includes(style.id)}
                    onToggleFavourite={() => toggleFavourite(style.id)}
                    onPress={() => openStyle(style.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {/* Two different things get shown on this screen and they should never
            be described the same way: a generated preview, and the walkthrough
            standing in for one. `look.simulated` is the look's own record of
            which it is, so a look saved months ago still says the right thing. */}
        <View style={styles.explainer}>
          <Ionicons
            name={look.simulated ? 'information-circle-outline' : 'sparkles-outline'}
            size={17}
            color={colors.inkSoft}
          />
          <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
            {look.simulated
              ? 'Nothing was generated for this one, so it shows the original photo with the chosen style recorded against it. The sample photo has no image behind it to edit, and previews are simulated when no generator key is configured.'
              : 'Generated from your photo and the catalog’s renders of this cut. Only the hair was changed — your face, pose, clothes, background and lighting are the original pixels.'}
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
    paddingRight: spacing.md,
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
