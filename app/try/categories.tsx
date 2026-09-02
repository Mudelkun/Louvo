import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { categoriesFor } from '@/api/client';
import { LoadingState } from '@/components/Feedback';
import { Header, Screen } from '@/components/Screen';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const TILE = (width - spacing.xl * 2 - spacing.md) / 2;

/** Step 3 — icon and name only; everything else waits until the catalog. */
export default function CategoriesScreen() {
  const router = useRouter();
  const { categories, loading } = useCatalog();
  const { gender, setCategory } = useSession();

  const visible = categoriesFor(categories, gender);

  const open = (categoryId: string) => {
    setCategory(categoryId === 'all' ? null : categoryId);
    router.push(`/try/catalog?categoryId=${categoryId}`);
  };

  const tiles = [
    ...visible.map((category) => ({ id: category.id, name: category.name, icon: category.icon })),
    { id: 'all', name: 'All Styles', icon: 'grid-outline' },
  ];

  return (
    <Screen padded={false}>
      <Header />

      <View style={styles.body}>
        <Text style={[type.title, styles.title]}>Choose a Category</Text>
        <Text style={[type.body, styles.subtitle]}>Pick a category to explore hairstyles.</Text>

        {loading ? (
          <LoadingState label="Loading categories…" />
        ) : (
          <View style={styles.grid}>
            {tiles.map((tile) => (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={tile.name}
                onPress={() => open(tile.id)}
                style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <Ionicons name={tile.icon as never} size={26} color={colors.ink} />
                <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
                  {tile.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: TILE,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
});
