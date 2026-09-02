import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, radii, spacing, type } from '@/theme/theme';

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={[type.heading, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      {body ? (
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" full={false} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

/** Reusable "this is a prototype" note so simulated behaviour is never mistaken for real. */
export function MockNotice({ children }: { children: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="flask-outline" size={15} color={colors.accentInk} />
      <Text style={[type.caption, { color: colors.accentInk, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'jade' | 'gold' }) {
  const palette = {
    neutral: { bg: colors.surfaceAlt, fg: colors.inkSoft },
    accent: { bg: colors.accentSoft, fg: colors.accentInk },
    jade: { bg: colors.jadeSoft, fg: colors.jade },
    gold: { bg: colors.goldSoft, fg: '#8A6520' },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[type.caption, { color: palette.fg, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
});
