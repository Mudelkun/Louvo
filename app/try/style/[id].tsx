import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { adjustmentsFor, colorById, defaultOptionsFor } from '@/api/client';
import type { Adjustment, TryOnOptions } from '@/api/types';
import { Button, IconButton } from '@/components/Button';
import { ChoiceRow, ColorSwatches } from '@/components/Controls';
import { EmptyState, LoadingState } from '@/components/Feedback';
import { Mannequin } from '@/components/Mannequin';
import { Header, Screen } from '@/components/Screen';
import { TRY_ON_STEPS } from '@/lib/constants';
import { VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const THUMB_WIDTH = (width - spacing.xl * 2 - spacing.md * 2) / 3;
const THUMB_HEIGHT = THUMB_WIDTH * 0.86;

const ANGLE_LABELS: Record<ViewAngle, string> = {
  front: 'Front view',
  side: 'Side view',
  back: 'Back view',
};

/**
 * Step 4 — the last stop before generation: the style from three angles, every
 * adjustment the catalog says it supports, and the generate button.
 */
export default function StyleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { styleById, colors: palette, loading } = useCatalog();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { gender, photoUri, setHairstyle } = useSession();
  const { start } = useGeneration();

  const hairstyle = styleById(id);
  const [options, setOptions] = useState<TryOnOptions>({});
  const [angle, setAngle] = useState<ViewAngle>('front');

  const resolved = useMemo<TryOnOptions>(() => {
    if (!hairstyle) return {};
    return { ...defaultOptionsFor(hairstyle), ...options };
  }, [hairstyle, options]);

  const adjustments = useMemo(() => (hairstyle ? adjustmentsFor(hairstyle) : []), [hairstyle]);

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
  const activeColor = colorById(palette, resolved.color ?? hairstyle.defaultColorId);
  const isDefault = JSON.stringify(resolved) === JSON.stringify(defaultOptionsFor(hairstyle));

  /**
   * Generation runs in the background — the user is sent straight to My looks,
   * where the preview shows as a processing tile and notifies when it is ready.
   */
  const generate = () => {
    setHairstyle(hairstyle.id, resolved);
    start({
      hairstyle,
      gender: gender ?? hairstyle.genders[0],
      photoUri,
      options: resolved,
    });
    router.replace('/(tabs)/profile');
  };

  const addPhoto = () => {
    setHairstyle(hairstyle.id, resolved);
    router.push('/(tabs)');
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
            onPress={addPhoto}
          />
        )
      }
    >
      <Header
        step={{ current: 4, total: TRY_ON_STEPS }}
        right={
          isDefault ? null : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOptions({})}>
              <Text style={[type.label, { color: colors.accent }]}>Reset</Text>
            </Pressable>
          )
        }
      />

      <View style={styles.hero}>
        <Mannequin
          shape={hairstyle.shape}
          options={resolved}
          color={activeColor}
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

        {/* The same style from three angles — the fade and the nape only read
            from the side and the back. */}
        <View style={styles.angleRow}>
          {VIEW_ANGLES.map((entry) => (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityLabel={ANGLE_LABELS[entry]}
              accessibilityState={{ selected: entry === angle }}
              onPress={() => setAngle(entry)}
              style={({ pressed }) => [
                styles.thumb,
                entry === angle && styles.thumbSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Mannequin
                shape={hairstyle.shape}
                options={resolved}
                color={activeColor}
                gender={gender}
                angle={entry}
                size={THUMB_WIDTH * 0.82}
                backdrop={null}
                style={{ marginTop: THUMB_HEIGHT * 0.06 }}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.adjustments}>
          {adjustments.map((adjustment) => (
            <AdjustmentControl
              key={adjustment.id}
              adjustment={adjustment}
              options={resolved}
              palette={palette}
              onChange={(patch) => setOptions((prev) => ({ ...prev, ...patch }))}
            />
          ))}
        </View>

        <Text style={[type.caption, styles.note]}>
          Generating takes a few seconds and runs in the background — you will get a notification
          when your look is ready in My looks.
        </Text>
      </View>
    </Screen>
  );
}

/** Renders whichever control the catalog says this style supports. */
function AdjustmentControl({
  adjustment,
  options,
  palette,
  onChange,
}: {
  adjustment: Adjustment;
  options: TryOnOptions;
  palette: Parameters<typeof ColorSwatches>[0]['palette'];
  onChange: (patch: Partial<TryOnOptions>) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]}>{adjustment.label}</Text>
        {adjustment.hint ? (
          <Text style={[type.caption, { color: colors.muted }]}>{adjustment.hint}</Text>
        ) : null}
      </View>

      {adjustment.kind === 'choice' ? (
        <ChoiceRow
          options={adjustment.options}
          value={
            (options as Record<string, string | undefined>)[adjustment.id] ?? adjustment.defaultValue
          }
          onChange={(value) => onChange({ [adjustment.id]: value })}
        />
      ) : null}

      {adjustment.kind === 'color' ? (
        <ColorSwatches
          palette={palette}
          value={options.color ?? adjustment.defaultValue}
          onChange={(value) => onChange({ color: value })}
        />
      ) : null}
    </View>
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
  angleRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
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
  adjustments: { gap: spacing.xl, paddingTop: spacing.xl },
  note: { color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.xl },
});
