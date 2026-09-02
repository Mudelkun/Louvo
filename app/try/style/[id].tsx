import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { SwatchRow } from '@/components/Controls';
import { EmptyState, LoadingState } from '@/components/Feedback';
import { Mannequin } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { useHairColor } from '@/hooks/useHairColor';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { DEMO_BASE_SHAPE, DEMO_PHOTO, TRY_ON_STEPS } from '@/lib/constants';
import { HERO_ANGLE, VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const THUMB_WIDTH = (width - spacing.xl * 2 - spacing.sm * 3) / 4;
const THUMB_HEIGHT = THUMB_WIDTH * 0.86 + 18;

/** Caption on the tile, and the longer label a screen reader announces. */
const ANGLE_LABELS: Record<ViewAngle, { short: string; long: string }> = {
  front: { short: 'Front', long: 'Front view' },
  half: { short: 'Half', long: 'Half-side view' },
  side: { short: 'Side', long: '90 degree side view' },
  back: { short: 'Back', long: 'Back view' },
};

/**
 * Step 4 — the last stop before generation: the style from four angles, the
 * photo it goes on, and the generate button. Nothing about the cut is
 * adjustable; the cut is the product.
 */
export default function StyleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { styleById, colors: hairColors, loading } = useCatalog();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { gender, photoUri, colorId, setPhoto, setColor, setHairstyle } = useSession();
  const color = useHairColor();
  const { start } = useGeneration();
  // Arriving here from the Styles tab skips the photo step, so the photo is
  // picked on this screen rather than sending the user back through the flow.
  const { pickFromLibrary, takePhoto, busy } = usePhotoPicker(setPhoto);

  const hairstyle = styleById(id);
  const [angle, setAngle] = useState<ViewAngle>(HERO_ANGLE);

  if (loading && !hairstyle) {
    return (
      <Screen>
        <Header />
        <LoadingState />
      </Screen>
    );
  }

  if (!hairstyle) {
    return (
      <Screen>
        <Header title="Style" />
        <EmptyState
          icon="alert-circle-outline"
          title="That style is not in the catalog"
          body="It may have been removed. Browse the catalog to find something similar."
          actionLabel="Browse styles"
          onAction={() => router.replace('/(tabs)/styles')}
        />
      </Screen>
    );
  }

  const favourite = isFavourite(hairstyle.id);

  /**
   * Generation runs in the background — the user is sent straight to My looks,
   * where the preview shows as a processing tile and notifies when it is ready.
   */
  const generate = () => {
    // The colour goes onto the look, not just onto the screen: a saved look has
    // to keep the shade it was generated in after the picker has moved on.
    const options = { color: color.id };
    setHairstyle(hairstyle.id, options);
    start({
      hairstyle,
      gender: gender ?? hairstyle.genders[0],
      photoUri,
      options,
    });
    router.replace('/(tabs)/profile');
  };

  return (
    <Screen
      padded={false}
      footer={
        photoUri ? (
          <Button label="Generate my preview" icon="sparkles" onPress={generate} />
        ) : (
          <Button
            label="Add a photo to generate"
            icon="camera-outline"
            variant="dark"
            loading={busy}
            onPress={pickFromLibrary}
          />
        )
      }
    >
      <Header step={{ current: 4, total: TRY_ON_STEPS }} />

      <View style={styles.hero}>
        <Mannequin
          styleId={hairstyle.id}
          shape={hairstyle.shape}
          color={color}
          gender={gender}
          angle={angle}
          size={width * 0.68}
          backdrop={null}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[type.title, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
            {hairstyle.name}
          </Text>
          <IconButton
            icon={favourite ? 'heart' : 'heart-outline'}
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            active={favourite}
            onPress={() => toggleFavourite(hairstyle.id)}
          />
        </View>

        {/* The same style from four angles — the fringe reads dead-on, the taper
            and the ear from the half turn, the fade in profile, the nape from
            behind. */}
        <View style={styles.angleRow}>
          {VIEW_ANGLES.map((entry) => (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityLabel={ANGLE_LABELS[entry].long}
              accessibilityState={{ selected: entry === angle }}
              onPress={() => setAngle(entry)}
              style={({ pressed }) => [
                styles.thumb,
                entry === angle && styles.thumbSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Mannequin
                styleId={hairstyle.id}
                shape={hairstyle.shape}
                color={color}
                gender={gender}
                angle={entry}
                size={THUMB_WIDTH * 0.82}
                backdrop={null}
                style={{ marginTop: THUMB_HEIGHT * 0.04 }}
              />
              <Text style={[styles.thumbLabel, entry === angle && { color: colors.accent }]}>
                {ANGLE_LABELS[entry].short}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Colour is the app's, not the generator's: every style is rendered in
            one shade and graded to the chosen one here, so a swatch costs a
            catalog row rather than a re-shoot of the catalog. */}
        {hairColors.length ? (
          <View style={styles.colorSection}>
            <View style={styles.colorHeader}>
              <Text style={[type.label, { color: colors.ink }]}>Colour</Text>
              <Text style={[type.caption, { color: colors.muted }]}>{color.name}</Text>
            </View>
            <SwatchRow
              items={hairColors}
              value={colorId ?? color.id}
              onChange={setColor}
              contentPaddingHorizontal={0}
            />
          </View>
        ) : null}

        {/* The photo, in place — the cut and the face it goes on are the only
            two things this screen asks for. */}
        <View style={styles.photoCard}>
          {photoUri ? (
            <View style={styles.photoRow}>
              <PhotoFrame
                uri={photoUri}
                rounded={radii.md}
                style={styles.photoThumb}
                demo={{ shape: DEMO_BASE_SHAPE, color, gender }}
                demoWidth={104}
              />
              <View style={styles.photoCopy}>
                <Text style={[type.label, { color: colors.ink }]}>Your photo</Text>
                <Text style={[type.caption, { color: colors.muted }]}>
                  This cut gets rendered onto this photo.
                </Text>
                <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={pickFromLibrary}>
                  <Text style={styles.link}>Change photo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={styles.photoRow}>
                <View style={styles.photoBadge}>
                  <Ionicons name="person-outline" size={24} color={colors.accent} />
                </View>
                <View style={styles.photoCopy}>
                  <Text style={[type.label, { color: colors.ink }]}>Add your photo</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    A clear front-facing shot gives the best result. We don’t store your photos.
                  </Text>
                </View>
              </View>

              <View style={styles.photoActions}>
                <Button
                  label="Upload"
                  icon="cloud-upload-outline"
                  variant="soft"
                  size="md"
                  full={false}
                  loading={busy}
                  onPress={pickFromLibrary}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Camera"
                  icon="camera-outline"
                  variant="soft"
                  size="md"
                  full={false}
                  loading={busy}
                  onPress={takePhoto}
                  style={{ flex: 1 }}
                />
              </View>

              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPhoto(DEMO_PHOTO)}>
                <Text style={[styles.link, { textAlign: 'center' }]}>Use a sample photo</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[type.caption, styles.note]}>
          Generating takes a few seconds and runs in the background — you will get a notification
          when your look is ready in My looks.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingTop: spacing.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbSelected: { borderColor: colors.accent },
  thumbLabel: {
    ...type.caption,
    color: colors.muted,
    marginTop: 'auto',
    marginBottom: spacing.xs,
    fontSize: 11,
  },
  colorSection: { marginTop: spacing.lg, gap: spacing.sm },
  colorHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  photoCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photoThumb: { width: 64, height: 82 },
  photoCopy: { flex: 1, gap: spacing.xs },
  photoBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  link: { ...type.caption, color: colors.accent, fontWeight: '700' as const },
  note: { color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.xl },
});
