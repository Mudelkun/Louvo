import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

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
  const styles = useStyles();
  const colors = useColors();
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

/*
 * There is no `<LoadingState>` here any more.
 *
 * A spinner over a caption was the app's answer to every wait for content, and
 * it is the wrong one: it says something is happening and nothing about what,
 * and the page it sits on reflows completely the moment the data lands. Every
 * one of those waits is now a placeholder shaped like the thing being waited
 * for — see `<Skeleton>` and the compositions beside the layouts they mirror
 * (`<StyleCardSkeleton>`, `<StyleScreenSkeleton>`). A spinner is still right for
 * an *action* in flight, which is what `<Button loading>` draws.
 */

/** Reusable "this is a prototype" note so simulated behaviour is never mistaken for real. */
export function MockNotice({ children }: { children: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.notice}>
      <Ionicons name="flask-outline" size={15} color={colors.accentInk} />
      <Text style={[type.caption, { color: colors.accentInk, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'jade' | 'rust' }) {
  const styles = useStyles();
  const colors = useColors();
  const palette = {
    neutral: { bg: colors.surfaceAlt, fg: colors.inkSoft },
    accent: { bg: colors.accentSoft, fg: colors.accentInk },
    jade: { bg: colors.jadeSoft, fg: colors.jade },
    rust: { bg: colors.rustSoft, fg: colors.rust },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[type.caption, { color: palette.fg, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
}));
