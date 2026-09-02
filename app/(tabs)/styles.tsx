import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Gender, HairTypeId } from '@/api/types';
import { CatalogBrowser } from '@/components/CatalogBrowser';
import { ChoiceRow } from '@/components/Controls';
import { ALL_HAIR_TYPES } from '@/lib/hairTypes';
import { useSession } from '@/state/SessionContext';
import { colors, spacing, type } from '@/theme/theme';

const GENDER_FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'male', label: 'Men' },
  { id: 'female', label: 'Women' },
];

/** The full catalog, browsable outside the try-on flow. */
export default function StylesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gender, hairTypeId } = useSession();
  const [filter, setFilter] = useState<string>(gender ?? 'all');
  const [categoryId, setCategoryId] = useState<string>('all');
  // The tab is a browsing surface rather than a step in the flow, so its hair
  // type is local: looking at the coily catalog here does not silently rewrite
  // what the try-on flow thinks the user's hair does.
  const [hairType, setHairType] = useState<HairTypeId | null>(hairTypeId);

  const resolvedGender: Gender | null = filter === 'all' ? null : (filter as Gender);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + spacing.md }}>
      <CatalogBrowser
        gender={resolvedGender}
        hairType={hairType}
        onHairTypeChange={setHairType}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        // The tab's hair type is local, so it travels with the tap instead of
        // through the session: the detail page opens on the texture the grid
        // was showing rather than on the try-on flow's.
        onSelect={(style) =>
          router.push({
            pathname: '/try/style/[id]',
            params: { id: style.id, hairType: hairType ?? ALL_HAIR_TYPES },
          })
        }
        bottomInset={spacing.xxxl * 2}
        header={
          <View style={styles.header}>
            <Text style={[type.title, { color: colors.ink }]}>Style catalog</Text>
            <Text style={[type.body, { color: colors.muted, marginBottom: spacing.lg }]}>
              Every cut is modelled on the same neutral mannequin, so you are comparing haircuts and
              nothing else.
            </Text>
            <ChoiceRow options={GENDER_FILTERS} value={filter} onChange={setFilter} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs },
});
