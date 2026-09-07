/**
 * The generation counter, top-left of every page.
 *
 * A metered app has to answer "how many have I got left?" without being asked,
 * because the answer changes what the next tap is worth. Settings already
 * carried the balance and the style screen already put it on the Generate
 * button, but both are places you have to already be going; this is the number
 * on screen the whole time, in the corner, next to the diamond that stands for
 * a credit everywhere else in the app.
 *
 * ## What it may say, and what it may never say
 *
 * The same rule `AccountContext` is written around: **the balance shown is the
 * balance the server last reported, and loading is not zero.** So there are
 * three states rather than one, and each has its own glyph:
 *
 * - `—` while `ready` is false. Never `0`. A counter that reads zero for the
 *   half second before the first response lands tells somebody who has twenty
 *   generations that they have none, which is the one lie this component could
 *   tell that would actually cost a sale.
 * - `∞` in a build with no backend. `UNMETERED` reports `Infinity` on purpose —
 *   there is no credit system to count against — and printing "Infinity" or
 *   hiding the badge would both be worse than saying so.
 * - the number otherwise, which is `credits.total`: free and purchased
 *   together, because what the user is asking is how many previews they may
 *   start, not which pocket they come out of.
 *
 * ## Where it sits
 *
 * `<Header>` renders one in its left slot, which covers every screen that has a
 * header; the four that do not (the three tabs and the welcome hero) render one
 * themselves. There is deliberately no global overlay: an absolutely-positioned
 * badge above the navigator would land on top of the back button on twenty
 * screens, and would float over both screens during a stack transition. Laid
 * out in the header row it is a sibling of the back button rather than a thing
 * covering it.
 *
 * On a screen with a back button the badge sits immediately beside it rather
 * than in the corner itself — the back affordance keeps the corner it owns on
 * every phone ever made. With `hideBack`, nothing is drawn in front of it and
 * the badge is flush to the corner.
 */

import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAccount } from '@/state/AccountContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

/**
 * The width `<Header>` reserves for its left and right slots.
 *
 * Both sides are held at the same fixed width so the centred title stays
 * centred whatever the badge happens to read — a slot that sized to its content
 * would slide the title sideways as the balance went from 2 to 12.
 *
 * It is the back button, a gap and a two-digit pill, and it is deliberately not
 * wide enough for a three-digit one. Every point spent here comes off the title,
 * which is the thing that truncates: at 104 the longest title in the app ("More
 * styles for you") no longer fits on a 6.1" phone. A balance of 100 or more
 * overflows the slot by a few points into the centre's own empty margin instead,
 * which is invisible unless the title is also long — the rarer collision of the
 * two, and the one that costs nothing when it happens.
 */
export const CREDIT_BADGE_SLOT = 96;

export function CreditBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const { credits, ready, metered } = useAccount();

  const dark = tone === 'dark';
  // Already on the shop: the badge is still the balance, it is just not a way
  // of getting somewhere you are.
  const here = pathname === '/credits';

  const label = !metered ? '∞' : ready ? String(credits.total) : '—';
  const spoken = !metered
    ? 'Unlimited generations in this build'
    : ready
      ? `${credits.total} generation${credits.total === 1 ? '' : 's'} left`
      : 'Loading your generations';

  return (
    <Pressable
      accessibilityRole={here ? 'text' : 'button'}
      accessibilityLabel={here ? spoken : `${spoken}. Get more.`}
      disabled={here}
      hitSlop={8}
      onPress={() => router.push('/credits')}
      style={({ pressed }) => [
        styles.pill,
        dark && styles.pillDark,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="diamond" size={12} color={dark ? colors.onDark : colors.accentInk} />
      <Text
        style={[type.label, { color: dark ? colors.onDark : colors.accentInk }]}
        numberOfLines={1}
        // The count is the one thing on the pill that must survive a large
        // system font: the diamond can be crowded, an unreadable number cannot.
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The badge in the corner of a screen that has no `<Header>` to put it in.
 *
 * Takes the safe-area padding as a prop rather than reading the insets itself,
 * because the screens that need it are already positioning their own first row
 * against `insets.top` and two independent readings of it drift apart by a
 * spacing step.
 */
export function CreditBadgeRow({
  paddingTop,
  right,
  tone,
}: {
  paddingTop: number;
  /** Anything the screen already had in the opposite corner. */
  right?: React.ReactNode;
  tone?: 'light' | 'dark';
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, { paddingTop }]}>
      <CreditBadge tone={tone} />
      {right ?? null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  // The same treatment the header's back button gets over a dark hero: a wash
  // of the ground rather than a light chip, which would read as a sticker.
  pillDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
}));
