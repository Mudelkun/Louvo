import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Gender } from '@/api/types';
import { Header, Screen } from '@/components/Screen';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

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
 */
export default function GenderScreen() {
  const router = useRouter();
  const { gender, setGender } = useSession();

  const choose = (value: Gender) => {
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
            const selected = gender === option.id;
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

const styles = StyleSheet.create({
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
});
