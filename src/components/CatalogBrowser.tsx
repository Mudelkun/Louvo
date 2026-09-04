import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { categoriesFor, filterHairstyles, hairTypesFor, type SortId } from '@/api/client';
import type { Gender, HairTypeId, Hairstyle } from '@/api/types';
import { FilterSelect, type SelectOption } from '@/components/Controls';
import { EmptyState, LoadingState } from '@/components/Feedback';
import { StyleCard } from '@/components/StyleCard';
import { useHairColor } from '@/hooks/useHairColor';
import { hairTypeExample, hasHairTypeExamples } from '@/lib/hairTypeExample';
import { HERO_ANGLE } from '@/lib/hairShape';
import { ALL_HAIR_TYPES, variantsOf } from '@/lib/hairTypes';
import { preloadVariants } from '@/lib/mannequinPreload';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { colors, radii, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const GUTTER = spacing.xl;
const CARD_WIDTH = (width - GUTTER * 2 - spacing.md) / 2;

/** Screen copy for `SortId`; the orders themselves live in the api layer. */
const SORTS: SelectOption[] = [
  { id: 'popular', label: 'Most popular' },
  { id: 'az', label: 'A to Z' },
  { id: 'upkeep', label: 'Lowest upkeep' },
];

interface CatalogBrowserProps {
  gender: Gender | null;
  /**
   * The hair type the catalog is being browsed as, or null for "All Types".
   *
   * More than a filter: it removes the styles that are not offered for that
   * type at all (an afro is not a type 1 haircut) and picks which render of
   * each survivor is shown. Passing `onHairTypeChange` puts a hair-type filter
   * beside the category one so it can be changed without leaving the grid.
   */
  hairType: HairTypeId | null;
  onHairTypeChange?: (hairType: HairTypeId | null) => void;
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
  hairType,
  onHairTypeChange,
  categoryId,
  onCategoryChange,
  onSelect,
  selectedId,
  header,
  bottomInset = spacing.xxxl,
}: CatalogBrowserProps) {
  const { hairstyles, categories, hairTypes, loading } = useCatalog();
  const { favouriteIds, toggleFavourite } = useLibrary();
  // One shade for the whole grid, whichever one the user is browsing in: the
  // cards still differ from each other only by their cut.
  const color = useHairColor();
  // The field is put away until it is asked for: two filters and a search box
  // stacked above the grid is three rows of controls before any hairstyle, and
  // the search is the one of the three that is usually not wanted.
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortId>('popular');

  // Closing puts the term back too — a filter that is still narrowing the grid
  // from behind a collapsed icon is a filter the user cannot see.
  const closeSearch = () => {
    setSearch('');
    setSearchOpen(false);
  };

  // The neutral option leads each list: it is what the control shows when the
  // dimension is unset. See `<FilterSelect>`.
  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { id: 'all', label: 'All' },
      ...categoriesFor(categories, gender).map((category) => ({ id: category.id, label: category.name })),
    ],
    [categories, gender],
  );

  /**
   * The same generated examples the hair-type step shows, carried into the
   * filter's sheet: changing the type here is the same question asked again, and
   * four names on their own are a worse way to answer it than four pictures.
   *
   * They follow the gender above the grid, since the examples exist per gender
   * and the grid is already showing that gender's catalog; an unset gender
   * takes whichever set exists (`hairTypeExample`). All four or none, for the
   * reason the picker gives — a half-illustrated list reads as a failed load.
   */
  const typeOptions = useMemo<SelectOption[]>(() => {
    const entries = hairTypesFor(hairTypes);
    const illustrated = hasHairTypeExamples(
      gender,
      entries.map((entry) => entry.id),
    );
    return [
      { id: ALL_HAIR_TYPES, label: 'All types' },
      ...entries.map((entry) => ({
        id: entry.id as string,
        label: entry.name,
        image: illustrated ? hairTypeExample(gender, entry.id) ?? undefined : undefined,
      })),
    ];
  }, [hairTypes, gender]);

  const results = useMemo(
    () => filterHairstyles(hairstyles, { gender, hairType, categoryId, sort, search }),
    [hairstyles, gender, hairType, categoryId, sort, search],
  );

  /**
   * The other textures of everything on screen, fetched in the background.
   *
   * Changing the hair type is not a filter over one set of pictures: it picks a
   * different render of most of the survivors, so twenty cards all reach for an
   * image that has never been loaded and the grid changes over a card at a time.
   * Warming them while the user is browsing makes the switch a redraw.
   *
   * Only the hero angle, since a card never draws anything else, and only where
   * the type can actually be changed from the grid — a screen with no hair-type
   * filter on it has nothing to prepare for. `preloadVariants` fetches each
   * source once per process and one at a time, so re-running this on every
   * filter change costs nothing and never competes with the images being drawn.
   */
  useEffect(() => {
    if (!onHairTypeChange) return;
    for (const style of results) preloadVariants(style.id, gender, variantsOf(style), [HERO_ANGLE]);
  }, [results, gender, onHairTypeChange]);

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
          {/* One row of controls, and the search takes it over rather than
              sitting above it: while typing, the filters are the thing not
              being used. */}
          <View style={styles.filterRow}>
            {searchOpen ? (
              <View style={styles.search}>
                <Ionicons name="search" size={17} color={colors.muted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search styles, e.g. fade or bob"
                  placeholderTextColor={colors.muted}
                  style={[type.body, styles.input]}
                  returnKeyType="search"
                  autoFocus
                  accessibilityLabel="Search hairstyles"
                />
                <Ionicons
                  name="close-circle"
                  size={19}
                  color={colors.muted}
                  onPress={closeSearch}
                  suppressHighlighting
                  accessibilityRole="button"
                  accessibilityLabel="Close search"
                />
              </View>
            ) : (
              <>
                {onHairTypeChange ? (
                  <FilterSelect
                    placeholder="Hair type"
                    icon="color-wand-outline"
                    options={typeOptions}
                    value={hairType ?? ALL_HAIR_TYPES}
                    onChange={(id) => onHairTypeChange(id === ALL_HAIR_TYPES ? null : (id as HairTypeId))}
                    style={{ flex: 1 }}
                  />
                ) : null}
                <FilterSelect
                  placeholder="Category"
                  icon="cut-outline"
                  options={categoryOptions}
                  value={categoryId ?? 'all'}
                  onChange={onCategoryChange}
                  style={{ flex: 1 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Search hairstyles"
                  onPress={() => setSearchOpen(true)}
                  style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name="search" size={18} color={colors.inkSoft} />
                </Pressable>
              </>
            )}
          </View>
          {/* The filters state themselves now, so the count says only what the
              controls above it cannot: how many styles came back. */}
          <View style={styles.countRow}>
            <Text style={[type.caption, { color: colors.muted }]}>
              {results.length} {results.length === 1 ? 'style' : 'styles'}
            </Text>
            <FilterSelect
              placeholder="Sort"
              options={SORTS}
              value={sort}
              onChange={(id) => setSort(id as SortId)}
              variant="plain"
            />
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
            onAction={search ? closeSearch : undefined}
          />
        )
      }
      renderItem={({ item }) => (
        <StyleCard
          hairstyle={item}
          width={CARD_WIDTH}
          color={color}
          gender={gender}
          hairType={hairType}
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
  filterRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: GUTTER },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
  },
  // Sized and shaped like the `<FilterSelect>` pills it stands in for, so the
  // row does not change height when the field opens.
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  searchButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  input: { flex: 1, color: colors.ink, paddingVertical: 0 },
});
