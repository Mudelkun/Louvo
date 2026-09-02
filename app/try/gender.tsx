import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Gender } from '@/api/types';
import { Header, Screen } from '@/components/Screen';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const OPTIONS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

/** Step 2 — one tap, one decision. Choosing moves the flow on immediately. */
export default function GenderScreen() {
  const router = useRouter();
  const { setGender } = useSession();

  const choose = (value: Gender) => {
    setGender(value);
    router.push('/try/categories');
  };

  return (
    <Screen padded={false}>
      <Header />

      <View style={styles.body}>
        <Text style={[type.title, styles.title]}>Select Gender</Text>
        <Text style={[type.body, styles.subtitle]}>This helps us show you relevant styles.</Text>

        <View style={{ gap: spacing.lg }}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => choose(option.id)}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="person" size={44} color={colors.accent} />
              <Text style={[type.heading, { color: colors.ink }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
});
