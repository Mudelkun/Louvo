import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Gender, HairTypeId, Hairstyle } from '@/api/types';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/Controls';
import { FavouriteHeart } from '@/components/FavouriteHeart';
import { EmptyState, LoadingState } from '@/components/Feedback';
import { Mannequin } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { useHairColor } from '@/hooks/useHairColor';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { DEMO_BASE_SHAPE, DEMO_PHOTO, TRY_ON_STEPS } from '@/lib/constants';
import { HERO_ANGLE, VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';
import {
  HAIR_TYPE_IDS,
  parseHairType,
  textureFor,
  typesForVariant,
  variantCandidates,
  variantsOf,
} from '@/lib/hairTypes';
import { renderVariant } from '@/lib/mannequinRender';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
/**
 * One page of the angle pager, so a swipe moves exactly one angle. It is the
 * hero card's *inner* width — the card's own hairline border on each side, or
 * the pages drift out of step with the snap by 2px a page.
 */
const HERO_PAGE = width - spacing.xl * 2 - 2;
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
 * Which hair type to open the preview chips on when the user arrived without
 * declaring one — an unfiltered grid, a deep link, a saved look.
 *
 * The chips used to carry an "All types" entry for this case. As a *display*
 * choice it said nothing the types themselves do not: it only meant "whichever
 * render of this cut exists", which is a fact about what has been generated
 * rather than an answer about hair. So the opening chip is a real type, picked
 * as the one standing behind the image the grid card just showed — resolve the
 * card's own render and name the first type it stands in for, so the detail
 * screen never disagrees with the card that opened it. A style with no render
 * yet opens on the first type it is offered for.
 */
function openingType(hairstyle: Hairstyle, gender: Gender | null): HairTypeId | null {
  const shown = renderVariant(
    hairstyle.id,
    gender,
    HERO_ANGLE,
    variantCandidates(hairstyle, null),
  );
  const fromRender = shown ? typesForVariant(hairstyle, shown)[0] : undefined;
  return fromRender ?? HAIR_TYPE_IDS.find((entry) => hairstyle.variants[entry]) ?? null;
}

/**
 * Step 5 — the last stop before generation: the style from four angles, the
 * photo it goes on, and the generate button. Nothing about the cut is
 * adjustable; the cut is the product.
 */
export default function StyleDetailScreen() {
  const router = useRouter();
  const { id, hairType } = useLocalSearchParams<{ id: string; hairType?: string }>();
  const { styleById, hairTypes, loading } = useCatalog();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { gender, hairTypeId, photoUri, setPhoto, setHairstyle } = useSession();
  // The shade every mannequin is drawn in. There is no colour picker at the
  // moment, so this is the shade the catalog was rendered in for everyone —
  // the grade is an identity and the renders are shown untouched. Bringing the
  // choice back is a `<SwatchRow>` bound to `setColor`; nothing below changes.
  const color = useHairColor();
  const { start } = useGeneration();
  // Arriving here from the Styles tab skips the photo step, so the photo is
  // picked on this screen rather than sending the user back through the flow.
  const { pickFromLibrary, takePhoto, busy } = usePhotoPicker(setPhoto);

  const hairstyle = styleById(id);
  const [angle, setAngle] = useState<ViewAngle>(HERO_ANGLE);
  /**
   * Which hair type the mannequin is being shown on, and only a preview:
   * switching it here compares the cut across textures without changing what
   * the rest of the app thinks the user's hair does. The generated look uses
   * the session's type, not this.
   *
   * It opens on whatever the grid was filtered to, which arrives on the tap —
   * the Styles tab browses a hair type locally and never writes it to the
   * session, so following the session here would land on a different texture
   * than the card the user just pressed. Browsed with no type declared it is
   * null and `openingType()` picks the chip; reached without the param at all
   * (a deep link, a saved look) it falls back to the session's type.
   */
  const browsedAs = parseHairType(hairType);
  const [preview, setPreview] = useState<HairTypeId | null>(
    browsedAs === undefined ? hairTypeId : browsedAs,
  );
  const pager = useRef<ScrollView>(null);
  /** The pager starts on `HERO_ANGLE`, which is not page 0 — set once, on first layout. */
  const positioned = useRef(false);

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
  // The types this cut is actually offered for, and the renders behind them.
  const offered = HAIR_TYPE_IDS.filter((entry) => hairstyle.variants[entry]);
  // Always a type: the chips are the types the cut is offered for, and one of
  // them is selected even when the user declared nothing on the way in.
  const shownAs =
    (preview && hairstyle.variants[preview] ? preview : null) ??
    openingType(hairstyle, gender);
  const variants = variantCandidates(hairstyle, shownAs);
  const shape = { ...hairstyle.shape, texture: textureFor(hairstyle, shownAs) };
  const typeName = (entry: HairTypeId) => hairTypes.find((t) => t.id === entry)?.name ?? entry;

  const scrollToAngle = (next: ViewAngle, animated: boolean) =>
    pager.current?.scrollTo({ x: VIEW_ANGLES.indexOf(next) * HERO_PAGE, y: 0, animated });

  /** Tapping a thumbnail drives the same pager a swipe does, so the two never disagree. */
  const goToAngle = (next: ViewAngle) => {
    setAngle(next);
    scrollToAngle(next, true);
  };

  const onPagerSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / HERO_PAGE);
    const next = VIEW_ANGLES[Math.min(Math.max(index, 0), VIEW_ANGLES.length - 1)];
    if (next !== angle) setAngle(next);
  };

  const positionPager = () => {
    if (positioned.current) return;
    positioned.current = true;
    scrollToAngle(angle, false);
  };

  /**
   * Generation runs in the background — the user is sent straight to My looks,
   * where the preview shows as a processing tile and notifies when it is ready.
   */
  const generate = () => {
    // The colour still goes onto the look rather than being left implicit: a
    // saved look has to keep the shade it was generated in, whether the user
    // chose it or it is the catalog default.
    const options = color ? { color: color.id } : {};
    setHairstyle(hairstyle.id, options);
    start({
      hairstyle,
      gender: gender ?? hairstyle.genders[0],
      hairType: hairTypeId,
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
      <Header step={{ current: 5, total: TRY_ON_STEPS }} />

      {/* The four angles are pages, swiped like a carousel. The thumbnails
          below are the same pager by another name — tapping one and swiping to
          it land in the same place. */}
      <View style={styles.hero}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onLayout={positionPager}
          onMomentumScrollEnd={onPagerSettle}
        >
          {VIEW_ANGLES.map((entry) => (
            <View
              key={entry}
              style={styles.heroPage}
              accessibilityLabel={ANGLE_LABELS[entry].long}
            >
              <Mannequin
                styleId={hairstyle.id}
                shape={shape}
                color={color}
                gender={gender}
                variants={variants}
                angle={entry}
                size={width * 0.68}
                backdrop={null}
              />
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots} pointerEvents="none">
          {VIEW_ANGLES.map((entry) => (
            <View key={entry} style={[styles.dot, entry === angle && styles.dotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[type.title, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
            {hairstyle.name}
          </Text>
          <FavouriteHeart
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            favourite={favourite}
            onToggle={() => toggleFavourite(hairstyle.id)}
          />
        </View>

        {/* How the cut sits on each texture. Only the types this style is
            offered for appear, and two types that share a render show the same
            image on purpose — that is the matrix saying they look alike. */}
        {offered.length > 1 ? (
          <View style={styles.typeBlock}>
            <Text style={[type.caption, { color: colors.muted, paddingHorizontal: spacing.xl }]}>
              {variantsOf(hairstyle).length === 1
                ? 'This cut looks the same on every hair type'
                : 'Shown on'}
            </Text>
            <ChipRow
              items={offered.map((entry) => ({ id: entry, label: typeName(entry) }))}
              value={shownAs}
              onChange={(next) => setPreview(next as HairTypeId)}
              contentPaddingHorizontal={spacing.xl}
            />
          </View>
        ) : null}

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
              onPress={() => goToAngle(entry)}
              style={({ pressed }) => [
                styles.thumb,
                entry === angle && styles.thumbSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Mannequin
                styleId={hairstyle.id}
                shape={shape}
                color={color}
                gender={gender}
                variants={variants}
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
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  heroPage: {
    width: HERO_PAGE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.hairline },
  dotActive: { width: 18, backgroundColor: colors.accent },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  typeBlock: { gap: spacing.sm, marginTop: spacing.lg, marginHorizontal: -spacing.xl },
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
