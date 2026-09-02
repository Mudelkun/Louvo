import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { recommendationsFor } from '@/api/client';
import { Button } from '@/components/Button';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor } from '@/hooks/useHairColor';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.xl * 2 - spacing.md) / 2;

/** Step 10 of the flow: recommendations after a result, "more styles for you". */
export default function MoreStylesScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { hairstyles, styleById } = useCatalog();
  const { gender, restartStyleChoice } = useSession();
  const { favouriteIds, toggleFavourite } = useLibrary();
  const color = useHairColor();

  const seed = styleById(from);
  const recommended = useMemo(
    () => recommendationsFor(hairstyles, from ?? '', gender, 8),
    [hairstyles, from, gender],
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
        <View style={styles.grid}>
          {recommended.map((style) => (
            <StyleCard
              key={style.id}
              hairstyle={style}
              width={CARD_WIDTH}
              color={color}
              gender={gender}
              favourite={favouriteIds.includes(style.id)}
              onToggleFavourite={() => toggleFavourite(style.id)}
              onPress={() => open(style.id)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
