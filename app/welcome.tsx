import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Mannequin } from '@/components/Mannequin';
import { useHairColor } from '@/hooks/useHairColor';
import { useOnboarding } from '@/hooks/useOnboarding';
import { HERO_ANGLE } from '@/lib/hairShape';
import { useCatalog } from '@/state/CatalogContext';
import { colors, radii, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');

/** Three catalog styles shown on the hero — picked by popularity, not hardcoded. */
const HERO_COUNT = 3;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalog, hairstyles } = useCatalog();
  // The hero cards are catalog renders like any others, so they take the
  // session's shade rather than an anchor: pinned to the anchor they are shown
  // as shot, and three styles side by side is exactly where the two shades the
  // catalog is generated in read as two hair colours.
  const color = useHairColor();
  const { complete } = useOnboarding();

  const heroStyles = [...hairstyles].sort((a, b) => b.popularity - a.popularity).slice(0, HERO_COUNT);
  const highlights = catalog?.highlights ?? [];

  const start = () => {
    complete();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable onPress={start} hitSlop={12} style={styles.skip} accessibilityRole="button">
          <Text style={[type.label, { color: colors.onDarkMuted }]}>Skip</Text>
        </Pressable>

        <Text style={[type.overline, { color: colors.onDarkMuted, marginBottom: spacing.md }]}>HAIRIFY</Text>
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
          {highlights.slice(0, 4).map((highlight) => (
            <View key={highlight} style={styles.highlightRow}>
              <View style={styles.tick}>
                <Ionicons name="checkmark" size={13} color={colors.onDark} />
              </View>
              <Text style={[type.body, { color: colors.inkSoft, flex: 1 }]}>{highlight}</Text>
            </View>
          ))}
        </View>

        <Button label="Get started" iconRight="arrow-forward" onPress={start} style={{ marginTop: spacing.xl }} />
        <Text style={[type.caption, styles.disclaimer]}>
          Your photo stays on your device. Nothing is uploaded in this preview build.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  hero: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  skip: { position: 'absolute', right: spacing.xl, top: 0, padding: spacing.md, zIndex: 5 },
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
});
