import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Gender } from '@/api/types';
import { CatalogBrowser } from '@/components/CatalogBrowser';
import { ChoiceRow } from '@/components/Controls';
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
  const { gender } = useSession();
  const [filter, setFilter] = useState<string>(gender ?? 'all');
  const [categoryId, setCategoryId] = useState<string>('all');

  const resolvedGender: Gender | null = filter === 'all' ? null : (filter as Gender);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + spacing.md }}>
      <CatalogBrowser
        gender={resolvedGender}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        onSelect={(style) => router.push(`/try/style/${style.id}`)}
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
