import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GeneratedLook, Hairstyle, LookJob } from '@/api/types';
import { ChoiceRow } from '@/components/Controls';
import { EmptyState } from '@/components/Feedback';
import { PhotoFrame } from '@/components/PhotoFrame';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor, useLookColor } from '@/hooks/useHairColor';
import { DEMO_BASE_SHAPE } from '@/lib/constants';
import { textureFor, variantCandidates } from '@/lib/hairTypes';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.xl * 2 - spacing.md) / 2;
/** The picture is the content here, so the tile is tall and the text is minimal. */
const CARD_HEIGHT = CARD_WIDTH * 1.34;

const TABS = [
  { id: 'looks', label: 'My looks' },
  { id: 'favourites', label: 'Favourites' },
];

export default function ProfileTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('looks');
  const { savedLooks, favouriteIds, toggleFavourite, removeLook } = useLibrary();
  const { jobs, cancel, retry } = useGeneration();
  const { hairstyles, styleById } = useCatalog();
  const { setLook, gender, hairTypeId } = useSession();
  const color = useHairColor();

  const favourites = hairstyles.filter((style) => favouriteIds.includes(style.id));
  const empty = jobs.length === 0 && savedLooks.length === 0;

  const openLook = (look: GeneratedLook) => {
    setLook(look);
    router.push('/try/result');
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.titleRow}>
          <Text style={[type.title, { color: colors.ink }]}>Profile</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            hitSlop={10}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.settingsButton, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="settings-outline" size={19} color={colors.ink} />
          </Pressable>
        </View>
        <ChoiceRow options={TABS} value={tab} onChange={setTab} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
        {tab === 'looks' ? (
          empty ? (
            <EmptyState
              icon="images-outline"
              title="No looks yet"
              body="Generate a preview and it lands here — you can leave the screen while it works."
              actionLabel="Start a try-on"
              onAction={() => router.push('/(tabs)')}
            />
          ) : (
            <View style={styles.grid}>
              {/* In-flight previews sit at the front of the grid until they resolve. */}
              {jobs.map((job) => (
                <JobTile
                  key={job.id}
                  job={job}
                  onCancel={() => cancel(job.id)}
                  onRetry={() => retry(job.id)}
                />
              ))}

              {savedLooks.map((look) => {
                const style = styleById(look.hairstyleId);
                return (
                  <LookTile
                    key={look.id}
                    look={look}
                    hairstyle={style}
                    onPress={() => openLook(look)}
                    onDelete={() => removeLook(look.id)}
                  />
                );
              })}
            </View>
          )
        ) : favourites.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title="No favourites yet"
            body="Tap the heart on any style to keep it here for later."
            actionLabel="Browse styles"
            onAction={() => router.push('/(tabs)/styles')}
          />
        ) : (
          <View style={styles.grid}>
            {favourites.map((style) => (
              <StyleCard
                key={style.id}
                hairstyle={style}
                width={CARD_WIDTH}
                color={color}
                gender={gender}
                hairType={hairTypeId}
                favourite
                onToggleFavourite={() => toggleFavourite(style.id)}
                onPress={() => router.push(`/try/style/${style.id}`)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

/** A finished look: picture first, name only. */
function LookTile({
  look,
  hairstyle,
  onPress,
  onDelete,
}: {
  look: GeneratedLook;
  hairstyle?: Hairstyle;
  onPress: () => void;
  onDelete: () => void;
}) {
  // Each tile is a look that was generated in some shade and for some hair
  // type, not necessarily the ones the session is on now, so the tile resolves
  // both from the look itself.
  const color = useLookColor(look);
  const shape = hairstyle
    ? { ...hairstyle.shape, texture: textureFor(hairstyle, look.hairType) }
    : undefined;
  const variants = hairstyle ? variantCandidates(hairstyle, look.hairType) : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${look.hairstyleName} look`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}
    >
      <PhotoFrame
        uri={look.resultUri}
        rounded={radii.lg}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
        demo={{
          styleId: look.hairstyleId,
          shape: shape ?? DEMO_BASE_SHAPE,
          options: look.options,
          color,
          gender: look.gender,
          variants,
        }}
        demoWidth={CARD_HEIGHT * 0.78}
      >
        <LinearGradient
          colors={['transparent', 'rgba(25,22,39,0.72)']}
          style={styles.caption}
          pointerEvents="none"
        >
          <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]} numberOfLines={1}>
            {look.hairstyleName}
          </Text>
        </LinearGradient>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${look.hairstyleName} look`}
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => [styles.tileButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={15} color={colors.onDark} />
        </Pressable>
      </PhotoFrame>
    </Pressable>
  );
}

/** A preview still generating — the user can be anywhere in the app while this runs. */
function JobTile({ job, onCancel, onRetry }: { job: LookJob; onCancel: () => void; onRetry: () => void }) {
  const failed = job.status === 'failed';

  return (
    <View style={[styles.tile, styles.jobTile]}>
      {failed ? (
        <>
          <Ionicons name="alert-circle-outline" size={30} color={colors.onDark} />
          <Text style={[type.caption, styles.jobLabel]}>Generation failed</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.jobAction, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="refresh" size={14} color={colors.onDark} />
            <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ProgressRing
            progress={job.progress}
            size={CARD_WIDTH * 0.44}
            strokeWidth={5}
            trackColor="rgba(255,255,255,0.18)"
            labelStyle={{ ...type.bodyStrong, color: colors.onDark }}
          />
          <Text style={[type.caption, styles.jobLabel]} numberOfLines={1}>
            {job.hairstyleName}
          </Text>
          <Text style={[type.caption, { color: colors.onDarkMuted }]}>Processing…</Text>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cancel ${job.hairstyleName} preview`}
        hitSlop={8}
        onPress={onCancel}
        style={({ pressed }) => [styles.tileButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="close" size={16} color={colors.onDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radii.lg, ...shadow.card },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  jobTile: {
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  jobLabel: { color: colors.onDark, fontWeight: '700', marginTop: spacing.xs },
  jobAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  tileButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25,22,39,0.55)',
  },
});
