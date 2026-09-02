import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { CatalogBrowser } from '@/components/CatalogBrowser';
import { Header } from '@/components/Screen';
import { ALL_HAIR_TYPES } from '@/lib/hairTypes';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';
import { colors, spacing } from '@/theme/theme';

/** The whole catalog, reached straight from the hair type step.
 *
 *  Nothing sits above the grid but the controls that change it: the category
 *  name in the header and the count under the filters say what is on screen,
 *  and the blurb that used to explain the catalog said nothing the styles do
 *  not say better. */
export default function CatalogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { gender, hairTypeId, setHairType, setCategory, hairstyleId } = useSession();
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
          hairType={hairTypeId}
          onHairTypeChange={setHairType}
          categoryId={categoryId}
          selectedId={hairstyleId}
          onCategoryChange={changeCategory}
          // The type the grid is filtered to opens with the style, so the
          // detail page shows the cut on the texture that was on screen.
          onSelect={(style) =>
            router.push({
              pathname: '/try/style/[id]',
              params: { id: style.id, hairType: hairTypeId ?? ALL_HAIR_TYPES },
            })
          }
        />
      </View>
    </View>
  );
}
