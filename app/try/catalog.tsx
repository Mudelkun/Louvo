import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { CatalogBrowser } from '@/components/CatalogBrowser';
import { Reveal } from '@/components/Reveal';
import { Header } from '@/components/Screen';
import { ALL_HAIR_TYPES } from '@/lib/hairTypes';
import { useCatalog } from '@/state/CatalogContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { useSession } from '@/state/SessionContext';
import { spacing, type, useColors } from '@/theme/theme';

/** The whole catalog, reached straight from the hair type step.
 *
 *  Nothing sits above the grid but the controls that change it: the category
 *  name in the header and the count under the filters say what is on screen,
 *  and the blurb that used to explain the catalog said nothing the styles do
 *  not say better. */
export default function CatalogScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { gender, hairTypeId, setHairType, setCategory, hairstyleId } = useSession();
  const { categoryById } = useCatalog();
  const { active, step } = useOnboarding();
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? 'all');

  const category = categoryById(categoryId);

  const changeCategory = (next: string) => {
    setCategoryId(next);
    setCategory(next === 'all' ? null : next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={category?.name ?? 'All styles'} step={step('catalog')} />
      {/* The one step of the guided run whose next move is not a button: the
          grid is a grid, and a first-time user has no reason to know that a card
          is the way on. One line, and only while the run is on — a returning
          user arriving from the Styles tab does not need to be told what a
          catalog is. */}
      {active ? (
        <Reveal style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          <Text style={[type.body, { color: colors.muted }]}>
            Tap the cut you want to see on yourself.
          </Text>
        </Reveal>
      ) : null}
      <View style={{ flex: 1, marginTop: active ? spacing.md : spacing.lg }}>
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
