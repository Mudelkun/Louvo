import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HairType, HairTypeId } from '@/api/types';
import { ControlHeading } from '@/components/ControlCard';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
};

/**
 * The hair type a cut is being shown on, as a choice rather than as a caption.
 *
 * This was a scrolling chip row under the hero, headed "Shown on", listing only
 * the types the cut happened to be offered for. Everything about that read as a
 * label on the picture above it: a caption, then a strip of pills that scrolled
 * off the edge of the screen — the same shape the catalog uses for its browse
 * filters, but sitting where a gallery's caption sits. Users took it for a
 * legend of what they were looking at and not for something to press.
 *
 * So it is a titled control now, and it is built out of the three things that
 * make a control read as one:
 *
 * - **A fixed set of options.** All four types, always, in the catalog's own
 *   order, laid out as one row of equal tiles that never scrolls. A row whose
 *   length changes per style is a list of what exists; a row that is always the
 *   same four is a question with four answers. The ones this cut is not offered
 *   for stay in place, dimmed and unpressable, because "not for this cut" is an
 *   answer about the haircut and hiding it silently answers nothing.
 * - **One prominent selection.** Selected is the brass the app already uses for
 *   an active filter (`selectActive` in `Controls.tsx`) — soft brass ground, a
 *   brass border, brass text. Unselected is flat `surfaceAlt` with no border at
 *   all: recessed, quiet, obviously the same kind of thing as its neighbour.
 *   The old row put the selected chip in solid ink, which is the app's button
 *   colour and read as "this is the one on screen" rather than "this is what
 *   you picked".
 * - **A named question.** "Hair type", and a verb saying what pressing does.
 *
 * It is a *section* rather than a card: `<ControlCard>` supplies the border and
 * the padding, and shares them with the length slider below. See that file for
 * why the two adjustments stopped being two cards, and `<ControlHeading>` for
 * why the question and the verb are now one line instead of two.
 *
 * Nothing here names a hair type or knows how many there are: the tiles are
 * whatever `types` carries, tier and name straight from the catalog, so a fifth
 * type is still a data change. See `HairType` in `src/api/types.ts`.
 */
export function HairTypeChoice({
  types,
  available,
  value,
  onChange,
  note,
}: {
  /** The catalog's hair types, in display order. */
  types: HairType[];
  /** The subset this hairstyle is offered for; everything else is shown disabled. */
  available: HairTypeId[];
  value: HairTypeId | null;
  onChange: (id: HairTypeId) => void;
  /**
   * One line under the row for whatever is true of *this* cut — that its types
   * share a render, that some are not offered. Left off when neither is.
   */
  note?: string | null;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View>
      <ControlHeading title="Hair type" hint="Tap to compare" />

      <View style={styles.row} accessibilityRole="radiogroup">
        {types.map((entry) => {
          const offered = available.includes(entry.id);
          const selected = offered && entry.id === value;
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="radio"
              accessibilityLabel={`${entry.tier}, ${entry.name}`}
              accessibilityHint={offered ? undefined : 'Not offered for this cut'}
              accessibilityState={{ selected, disabled: !offered }}
              disabled={!offered}
              onPress={() => {
                tap();
                onChange(entry.id);
              }}
              style={({ pressed }) => [
                styles.tile,
                selected && styles.tileSelected,
                !offered && styles.tileDisabled,
                pressed && offered && !selected && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text
                style={[
                  styles.tier,
                  selected && { color: colors.accent },
                  !offered && { color: colors.hairlineStrong },
                ]}
                numberOfLines={1}
              >
                {entry.tier.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.name,
                  selected && { color: colors.accentInk },
                  !offered && { color: colors.muted },
                ]}
                numberOfLines={1}
              >
                {entry.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {note ? <Text style={[type.caption, styles.note]}>{note}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  tile: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    backgroundColor: colors.surfaceAlt,
    // Held by every state so the row does not shift by 3px when the selection
    // moves — only the colour of the border changes.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  /**
   * A slot rather than an option: the ground drops away to the card's own
   * white, leaving an outlined gap the eye passes over. Dimming a filled tile
   * instead only made it look pressed.
   */
  tileDisabled: { backgroundColor: 'transparent', borderColor: colors.hairline },
  // The tier and the name are set on their own line heights rather than on the
  // type scale's, so two lines of copy fit a 44pt tile without the gap that
  // `type.overline` and `type.label` carry for body text.
  tier: {
    ...type.overline,
    color: colors.muted,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.7,
  },
  name: { ...type.label, fontSize: 12, lineHeight: 16, letterSpacing: 0, color: colors.inkSoft },
  note: { color: colors.muted, marginTop: spacing.sm },
}));
