import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Gender } from '@/api/types';
import { Header, Screen } from '@/components/Screen';
import { useSession } from '@/state/SessionContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const OPTIONS: { id: Gender; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'male', label: 'Male', icon: 'man-outline' },
  { id: 'female', label: 'Female', icon: 'woman-outline' },
];

/**
 * Step 2 — one tap, one decision. Choosing moves the flow on to hair type.
 *
 * Two flat tiles side by side rather than two stacked cards: the choice is a
 * pair, and sitting them next to each other says so without any chrome. The
 * type is left-aligned and the tiles carry a hairline instead of a shadow, so
 * the only thing with any weight on the screen is the option in hand.
 *
 * Nothing is highlighted until the user taps. The highlight used to read from
 * the session, which is fine on a first run — gender starts null — and wrong on
 * every later one: the session keeps the gender across `restartStyleChoice` and
 * across going back to the photo step, so returning to the question showed it
 * already answered. A screen that asks a question must not also pre-answer it,
 * so the highlight is local to this visit and the session is only ever written.
 */
export default function GenderScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { setGender } = useSession();
  const [chosen, setChosen] = useState<Gender | null>(null);

  const choose = (value: Gender) => {
    setChosen(value);
    setGender(value);
    router.push('/try/hair-type');
  };

  return (
    <Screen padded={false}>
      <Header />

      <View style={styles.body}>
        <Text style={[type.display, styles.title]}>Select gender</Text>
        <Text style={[type.body, styles.subtitle]}>This helps us show you relevant styles.</Text>

        <View style={styles.row}>
          {OPTIONS.map((option) => {
            const selected = chosen === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                onPress={() => choose(option.id)}
                style={({ pressed }) => [
                  styles.tile,
                  selected && styles.tileSelected,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={40}
                  color={selected ? colors.accent : colors.inkSoft}
                />
                <Text
                  style={[type.bodyStrong, { color: selected ? colors.accentInk : colors.ink }]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  title: { color: colors.ink },
  subtitle: { color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    aspectRatio: 0.92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tileSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
