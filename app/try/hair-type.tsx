import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { hairTypesFor } from '@/api/client';
import type { HairTypeId } from '@/api/types';
import { LoadingState } from '@/components/Feedback';
import { Header, Screen } from '@/components/Screen';
import { hairTypeExample, hasHairTypeExamples } from '@/lib/hairTypeExample';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

/**
 * Step 3 — the catalog's primary dimension, asked before the catalog is shown.
 *
 * It is not a filter the user could just as well apply later: it decides which
 * hairstyles are on offer at all and which render of each one they see, so
 * asking first is what makes the catalog they then browse honest. "All Types"
 * is the way out for anyone who does not know or does not care, and it is a
 * real answer rather than a skip — it browses every style at whichever render
 * exists.
 *
 * Answering it opens the whole catalog. There is no category step in front of
 * it: category is a chip row over the same grid (`<CatalogBrowser>`), so it
 * narrows a catalog the user can already see instead of gating it.
 *
 * The four types are one grouped list rather than four floating cards: they are
 * a single question with four answers, and stacking separate shadowed cards
 * says the opposite. One hairline container, hairline dividers between the
 * rows, no shadow anywhere, and the type tier carried as an overline over the
 * name — the page reads as a spec sheet, and the only saturated thing on it is
 * the answer currently in hand. It matches the gender step, which is left
 * aligned and flat for the same reason.
 *
 * Nothing here names a hair type: the four come from the catalog like
 * everything else, so a fifth would be a data change.
 */
export default function HairTypeScreen() {
  const router = useRouter();
  const { hairTypes, loading } = useCatalog();
  const { gender, hairTypeId, setHairType } = useSession();

  const entries = hairTypesFor(hairTypes);

  /**
   * The four rows carry a generated example of the pattern when one exists for
   * the gender chosen a step earlier — a picture answers "what does my hair do"
   * that no icon and no sentence can. They are all-or-nothing
   * (`hasHairTypeExamples`): two photographed rows above two drawn ones would
   * read as a screen that failed to load, and the icons are a coherent set on
   * their own. `npm run hair-types` is what fills the gap.
   */
  const showExamples = hasHairTypeExamples(
    gender,
    entries.map((entry) => entry.id),
  );

  const choose = (value: HairTypeId | null) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
    setHairType(value);
    router.push('/try/catalog');
  };

  return (
    <Screen padded={false}>
      <Header />

      <View style={styles.body}>
        <Text style={[type.display, styles.title]}>Your hair type</Text>
        <Text style={[type.body, styles.subtitle]}>
          Some cuts sit completely differently depending on your texture. We will show you the
          version that matches yours.
        </Text>

        {loading ? (
          <LoadingState label="Loading hair types…" />
        ) : (
          <>
            <View style={styles.group} accessibilityRole="radiogroup">
              {entries.map((entry, index) => {
                const selected = hairTypeId === entry.id;
                const example = showExamples ? hairTypeExample(gender, entry.id) : null;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${entry.tier}, ${entry.name}`}
                    accessibilityHint={entry.description}
                    accessibilityState={{ selected }}
                    onPress={() => choose(entry.id)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivided,
                      selected && styles.rowSelected,
                      pressed && !selected && { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    {example ? (
                      <Image
                        source={example}
                        style={[styles.example, selected && styles.exampleSelected]}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={[styles.icon, selected && styles.iconSelected]}>
                        <Ionicons
                          name={entry.icon as never}
                          size={18}
                          color={selected ? colors.onDark : colors.inkSoft}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[type.overline, styles.tier, selected && { color: colors.accent }]}>
                        {entry.tier.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          type.bodyStrong,
                          { color: selected ? colors.accentInk : colors.ink },
                        ]}
                      >
                        {entry.name}
                      </Text>
                      <Text style={[type.caption, { color: colors.muted }]}>
                        {entry.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Deliberately outside the group and deliberately quieter: it is the
                answer for someone who wants to look around, not a fifth type. */}
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel="All types"
              accessibilityHint="Browse everything, whatever your hair does"
              accessibilityState={{ selected: hairTypeId === null }}
              onPress={() => choose(null)}
              style={({ pressed }) => [
                styles.allPill,
                hairTypeId === null && styles.allPillSelected,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  type.label,
                  { color: hairTypeId === null ? colors.accentInk : colors.inkSoft },
                ]}
              >
                Not sure — show me all types
              </Text>
              <Ionicons
                name="arrow-forward"
                size={15}
                color={hairTypeId === null ? colors.accentInk : colors.muted}
              />
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  title: { color: colors.ink },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    maxWidth: 320,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowSelected: { backgroundColor: colors.accentSoft },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  /**
   * Bigger than the icon it replaces, and a rounded square rather than a circle:
   * the example is a head of hair, and a circle crops the very silhouette the
   * row is there to show.
   */
  example: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
  },
  exampleSelected: { borderColor: colors.accent },
  tier: { color: colors.muted },
  allPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  allPillSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
