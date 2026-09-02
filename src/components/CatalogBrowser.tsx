import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { categoriesFor, filterHairstyles } from '@/api/client';
import type { Gender, Hairstyle } from '@/api/types';
import { ChipRow } from '@/components/Controls';
import { EmptyState, LoadingState } from '@/components/Feedback';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor } from '@/hooks/useHairColor';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { colors, radii, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const GUTTER = spacing.xl;
const CARD_WIDTH = (width - GUTTER * 2 - spacing.md) / 2;

interface CatalogBrowserProps {
  gender: Gender | null;
  categoryId: string | null;
  onCategoryChange: (categoryId: string) => void;
  onSelect: (hairstyle: Hairstyle) => void;
  selectedId?: string | null;
  /** Rendered above the chips — page titles, gender toggles, etc. */
  header?: React.ReactNode;
  /** Extra bottom padding so a fixed footer does not cover the last row. */
  bottomInset?: number;
}

/**
 * Shared catalog grid used by both the Styles tab and the try-on flow, so the
 * browsing experience is identical wherever it is reached from.
 */
export function CatalogBrowser({
  gender,
  categoryId,
  onCategoryChange,
  onSelect,
  selectedId,
  header,
  bottomInset = spacing.xxxl,
}: CatalogBrowserProps) {
  const { hairstyles, categories, loading } = useCatalog();
  const { favouriteIds, toggleFavourite } = useLibrary();
  // One shade for the whole grid, whichever one the user is browsing in: the
  // cards still differ from each other only by their cut.
  const color = useHairColor();
  const [search, setSearch] = useState('');

  const chips = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...categoriesFor(categories, gender).map((category) => ({ id: category.id, label: category.name })),
    ],
    [categories, gender],
  );

  const results = useMemo(
    () => filterHairstyles(hairstyles, { gender, categoryId, search }),
    [hairstyles, gender, categoryId, search],
  );

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: GUTTER }}
      contentContainerStyle={{ gap: spacing.md, paddingBottom: bottomInset }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: spacing.lg, marginBottom: spacing.xs }}>
          {header}
          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Ionicons name="search" size={17} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search styles, e.g. fade or bob"
                placeholderTextColor={colors.muted}
                style={[type.body, styles.input]}
                returnKeyType="search"
                accessibilityLabel="Search hairstyles"
              />
              {search.length > 0 ? (
                <Ionicons
                  name="close-circle"
                  size={17}
                  color={colors.muted}
                  onPress={() => setSearch('')}
                  suppressHighlighting
                />
              ) : null}
            </View>
          </View>
          <ChipRow items={chips} value={categoryId ?? 'all'} onChange={onCategoryChange} />
          <View style={{ paddingHorizontal: GUTTER }}>
            <Text style={[type.caption, { color: colors.muted }]}>
              {results.length} {results.length === 1 ? 'style' : 'styles'}
              {gender ? ` for ${gender === 'male' ? 'men' : 'women'}` : ''}
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <LoadingState label="Loading the catalog…" />
        ) : (
          <EmptyState
            icon="search-outline"
            title="Nothing matches that"
            body="Try a different search term, or switch category."
            actionLabel={search ? 'Clear search' : undefined}
            onAction={search ? () => setSearch('') : undefined}
          />
        )
      }
      renderItem={({ item }) => (
        <StyleCard
          hairstyle={item}
          width={CARD_WIDTH}
          color={color}
          gender={gender}
          favourite={favouriteIds.includes(item.id)}
          selected={selectedId === item.id}
          onToggleFavourite={() => toggleFavourite(item.id)}
          onPress={() => onSelect(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: GUTTER },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    height: 46,
  },
  input: { flex: 1, color: colors.ink, paddingVertical: 0 },
});
