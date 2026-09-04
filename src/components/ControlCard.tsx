import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

/**
 * The card the style screen's adjustments live in — one card, not one each.
 *
 * Hair type and hair length were two separate cards stacked down the page, each
 * with its own border, its own padding and its own two-line header. Together
 * they ran to nearly 400 points, which put the second one below the fold on
 * every phone: the screen offered two ways to change the cut and showed one.
 * A user who never scrolled never learned length existed.
 *
 * They belong together anyway. Both answer the same question — *how should this
 * cut be shown* — and neither is a section of the page in the way the photo card
 * below them is. Two cards said they were two subjects; one card with a hairline
 * between them says they are two adjustments to one thing, and costs a single
 * border and a single pad instead of two of each.
 *
 * It takes children rather than the controls themselves so it stays ignorant of
 * both: a style with no length row renders one section and no divider, a style
 * with neither renders nothing at all, and neither case is a special path here.
 * `React.Children.toArray` drops the nulls the screen passes for an absent
 * control, so the divider count is always one fewer than what is actually shown.
 */
export function ControlCard({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const sections = React.Children.toArray(children);
  if (!sections.length) return null;

  return (
    <View style={styles.card}>
      {sections.map((section, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {section}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * A section's name and, on the same line, the verb that says what to do with it.
 *
 * Each control used to carry a heading in `bodyStrong` with a full sentence of
 * caption under it ("Pick the texture you want to see this cut on"). That
 * sentence was doing real work — it is what stopped the hair-type row being read
 * as a caption on the picture above it — but two stacked lines is 40 points to
 * say a thing that fits in one. The named question and the verb both survive;
 * they just sit side by side now, the question in ink at the left margin and the
 * verb small and muted at the right, where a control's hint belongs.
 */
export function ControlHeading({ title, hint }: { title: string; hint?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.heading}>
      <Text style={[type.label, { color: colors.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {hint ? (
        <Text style={[type.caption, styles.hint]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  /**
   * Bled out to the card's edges rather than inset to its padding: an inset rule
   * reads as a decoration inside one block, a full-width one reads as the seam
   * between two.
   */
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
    marginHorizontal: -spacing.lg,
    backgroundColor: colors.hairline,
  },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  hint: { color: colors.muted, marginLeft: 'auto', flexShrink: 1 },
}));
