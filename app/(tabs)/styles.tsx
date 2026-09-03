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

// No "Everyone" option: the catalog is shot per gender, so the combined grid
// was two mannequins' idea of the same cut side by side. One or the other.
const GENDER_FILTERS = [
  { id: 'male', label: 'Men' },
  { id: 'female', label: 'Women' },
];

/** The full catalog, browsable outside the try-on flow. */
export default function StylesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gender, hairTypeId } = useSession();
  // The tab can be reached before the flow has asked, so there is always a
  // gender on screen: the session's if it has one, men otherwise.
  const [filter, setFilter] = useState<Gender>(gender ?? 'male');
  const [categoryId, setCategoryId] = useState<string>('all');
  // The tab is a browsing surface rather than a step in the flow, so its hair
  // type is local: looking at the coily catalog here does not silently rewrite
  // what the try-on flow thinks the user's hair does.
  const [hairType, setHairType] = useState<HairTypeId | null>(hairTypeId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + spacing.md }}>
      <CatalogBrowser
        gender={filter}
        hairType={hairType}
        onHairTypeChange={setHairType}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        // The tab's gender and hair type are both local, so they travel with the
        // tap instead of through the session: the detail page opens on the same
        // mannequin the card just showed rather than on the try-on flow's. The
        // gender matters as much as the texture — the catalog is shot per gender,
        // so following the session there opened every cut tapped in the women's
        // grid on its men's render.
        onSelect={(style) =>
          router.push({
            pathname: '/try/style/[id]',
            params: { id: style.id, hairType: hairType ?? ALL_HAIR_TYPES, gender: filter },
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
            <ChoiceRow
              options={GENDER_FILTERS}
              value={filter}
              onChange={(id) => setFilter(id as Gender)}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs },
});
