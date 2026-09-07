import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { generationSource } from '@/api/client';
import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { LegalLinks } from '@/components/LegalLinks';
import { Mannequin } from '@/components/Mannequin';
import { Reveal } from '@/components/Reveal';
import { useHairColor } from '@/hooks/useHairColor';
import { HERO_ANGLE } from '@/lib/hairShape';
import { useCatalog } from '@/state/CatalogContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const { width } = Dimensions.get('window');

/** Three catalog styles shown on the hero — picked by popularity, not hardcoded. */
const HERO_COUNT = 3;

/**
 * What actually happens to the photograph, in this build.
 *
 * It is read from `generationSource()` rather than written down, because the
 * three builds do genuinely different things with it and this is the screen
 * where the user decides whether to hand it over. The old line — "nothing is
 * uploaded in this preview build" — was true of the checkout it was written for
 * and became false the day previews moved to the server, which is the worst
 * class of copy there is: a promise that goes stale silently.
 *
 * `docs/preview-generation.md` is what the server line is a summary of.
 */
const PHOTO_PROMISE =
  generationSource() === 'server'
    ? 'Your photo is sent to make your preview, then deleted from our servers the moment it is done. It is never public and never stored.'
    : 'Your photo stays on your device. Nothing is uploaded.';

export default function WelcomeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalog, hairstyles } = useCatalog();
  // The hero cards are catalog renders like any others, so they take the
  // session's shade rather than an anchor: pinned to the anchor they are shown
  // as shot, and three styles side by side is exactly where the two shades the
  // catalog is generated in read as two hair colours.
  const color = useHairColor();
  const { begin, complete } = useOnboarding();

  const heroStyles = [...hairstyles].sort((a, b) => b.popularity - a.popularity).slice(0, HERO_COUNT);
  const highlights = catalog?.highlights ?? [];

  /**
   * Into the flow, not past it.
   *
   * This used to mark the device seen and drop the user on the home tab, which
   * made the welcome screen a poster: the app's first act was to hand somebody
   * an empty photo frame and let them work out what it was for. `begin()` starts
   * the guided run instead, and the run is the ordinary flow with a progress bar
   * on it — see `OnboardingContext`.
   *
   * Pushed rather than replaced so the first Back lands here, on the one screen
   * that says what any of this is.
   */
  const start = () => {
    begin();
    router.push('/try/gender');
  };

  /** Straight to the app, and the questions get asked in the flow as usual. */
  const skip = () => {
    complete();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        {/* The two things that sit over the hero rather than in it. The badge is
            worth showing before anybody has signed up for anything: two free
            generations is the offer, and this is where it is made. */}
        <View style={styles.badge}>
          <CreditBadge tone="dark" />
        </View>

        <Pressable onPress={skip} hitSlop={12} style={styles.skip} accessibilityRole="button">
          <Text style={[type.label, { color: colors.onDarkMuted }]}>Skip</Text>
        </Pressable>

        <Text style={[type.overline, { color: colors.onDarkMuted, marginBottom: spacing.md }]}>LUVO</Text>
        <Text style={[type.display, { color: colors.onDark, maxWidth: 300 }]}>
          See the haircut before you commit to it.
        </Text>

        <View style={styles.heroRow}>
          {heroStyles.map((style, index) => (
            <View
              key={style.id}
              style={[
                styles.heroCard,
                { marginTop: index === 1 ? 0 : spacing.xl, zIndex: index === 1 ? 2 : 1 },
              ]}
            >
              <Mannequin
                styleId={style.id}
                shape={style.shape}
                color={color}
                angle={HERO_ANGLE}
                size={width / 3.6}
                backdrop={null}
              />
              <Text style={[type.caption, styles.heroCaption]} numberOfLines={1}>
                {style.name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={{ gap: spacing.md }}>
          {highlights.slice(0, 4).map((highlight, index) => (
            <Reveal key={highlight} index={index} style={styles.highlightRow}>
              <View style={styles.tick}>
                <Ionicons name="checkmark" size={13} color={colors.onAccent} />
              </View>
              <Text style={[type.body, { color: colors.inkSoft, flex: 1 }]}>{highlight}</Text>
            </Reveal>
          ))}
        </View>

        <Button label="Get started" iconRight="arrow-forward" onPress={start} style={{ marginTop: spacing.xl }} />
        <Text style={[type.caption, styles.disclaimer]}>{PHOTO_PROMISE}</Text>
        {/* Under the promise rather than over the button: the sentence above is
            what somebody actually wants to know before pressing it, and the
            agreement is the formal version of the same thing. Both are reachable
            without leaving the app, so this is an offer to read them rather than
            a checkbox to get past. */}
        <LegalLinks action="continuing" />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.stage },
  hero: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  skip: { position: 'absolute', right: spacing.xl, top: 0, padding: spacing.md, zIndex: 5 },
  // `left: 0` rather than `spacing.xl`: an absolutely-positioned child is laid
  // out from its parent's padding edge, so the hero's own gutter is already in
  // the number and the badge lines up with the copy under it.
  badge: { position: 'absolute', left: 0, top: spacing.sm, zIndex: 5 },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCaption: { color: colors.onDarkMuted, marginTop: spacing.xs, paddingHorizontal: spacing.sm },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimer: { color: colors.muted, textAlign: 'center', marginTop: spacing.md },
}));
