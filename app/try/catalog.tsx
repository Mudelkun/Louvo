import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CatalogBrowser } from '@/components/CatalogBrowser';
import { Header } from '@/components/Screen';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';
import { colors, spacing, type } from '@/theme/theme';

export default function CatalogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { gender, setCategory, hairstyleId } = useSession();
  const { categoryById } = useCatalog();
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? 'all');

  const category = categoryById(categoryId);

  const changeCategory = (next: string) => {
    setCategoryId(next);
    setCategory(next === 'all' ? null : next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={category?.name ?? 'All styles'} />
      <View style={{ flex: 1, marginTop: spacing.lg }}>
        <CatalogBrowser
          gender={gender}
          categoryId={categoryId}
          selectedId={hairstyleId}
          onCategoryChange={changeCategory}
          onSelect={(style) => router.push(`/try/style/${style.id}`)}
          header={
            <View style={styles.header}>
              <Text style={[type.body, { color: colors.muted }]}>
                {category?.tagline ?? 'Everything in the catalog, newest and most requested first.'}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl },
});
