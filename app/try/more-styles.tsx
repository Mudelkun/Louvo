import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { recommendationsFor } from '@/api/client';
import { Button } from '@/components/Button';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { SkeletonGroup } from '@/components/Skeleton';
import { StyleCard, StyleCardSkeleton } from '@/components/StyleCard';
import { useHairColor } from '@/hooks/useHairColor';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, spacing, useColors, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.xl * 2 - spacing.md) / 2;

/** Step 10 of the flow: recommendations after a result, "more styles for you". */
export default function MoreStylesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { hairstyles, styleById, loading } = useCatalog();
  const { gender, hairTypeId, restartStyleChoice } = useSession();
  const { favouriteIds, toggleFavourite } = useLibrary();
  const color = useHairColor();

  const seed = styleById(from);
  const recommended = useMemo(
    () => recommendationsFor(hairstyles, from ?? '', gender, 8, hairTypeId),
    [hairstyles, from, gender, hairTypeId],
  );

  const open = (id: string) => {
    restartStyleChoice();
    router.push(`/try/style/${id}`);
  };

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label="Browse the full catalog"
          variant="secondary"
          icon="grid-outline"
          onPress={() => {
            restartStyleChoice();
            router.push('/try/catalog?categoryId=all');
          }}
        />
      }
    >
      <Header title="More styles for you" />

      <View style={{ paddingHorizontal: spacing.xl }}>
        <Text style={[type.body, { color: colors.muted, marginTop: spacing.sm }]}>
          {seed
            ? `Close to ${seed.name} in length, texture and upkeep.`
            : 'Picked from the styles most people try next.'}
        </Text>
        <SectionLabel>Recommended</SectionLabel>
        {loading && !recommended.length ? (
          /* Reached from a result, so the catalog is nearly always in hand by
             now — but an empty grid with a heading over it is a screen that
             says it has no recommendations rather than that it is fetching
             them. Four cards is the fold. */
          <SkeletonGroup label="Loading recommendations" style={styles.grid}>
            {[0, 1, 2, 3].map((card) => (
              <StyleCardSkeleton key={card} width={CARD_WIDTH} />
            ))}
          </SkeletonGroup>
        ) : (
          <View style={styles.grid}>
            {recommended.map((style) => (
              <StyleCard
                key={style.id}
                hairstyle={style}
                width={CARD_WIDTH}
                color={color}
                gender={gender}
                hairType={hairTypeId}
                favourite={favouriteIds.includes(style.id)}
                onToggleFavourite={() => toggleFavourite(style.id)}
                onPress={() => open(style.id)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
}));
