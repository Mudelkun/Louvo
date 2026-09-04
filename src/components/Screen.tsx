import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Renders a scroll view; pass false for screens that manage their own list. */
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  contentStyle?: ViewStyle;
  footer?: React.ReactNode;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  background,
  contentStyle,
  footer,
}: ScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Not a default parameter any more: the canvas is a value the running scheme
  // decides, and a default is evaluated against whatever the module was
  // imported with.
  const ground = background ?? colors.canvas;
  const body = (
    <View style={[padded && { paddingHorizontal: spacing.xl }, contentStyle]}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: ground }}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.lg, insets.bottom), backgroundColor: ground },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

interface HeaderProps {
  title?: string;
  subtitle?: string;
  /** Step "3 of 8" indicator for the try-on flow. */
  step?: { current: number; total: number };
  onBack?: () => void;
  hideBack?: boolean;
  right?: React.ReactNode;
  tone?: 'light' | 'dark';
}

export function Header({ title, subtitle, step, onBack, hideBack, right, tone = 'light' }: HeaderProps) {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tint = tone === 'dark' ? colors.onDark : colors.ink;

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={{ paddingTop: insets.top + spacing.sm }}>
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          {hideBack ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={handleBack}
              hitSlop={12}
              style={({ pressed }) => [
                styles.backButton,
                tone === 'dark' && { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'transparent' },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={tint} />
            </Pressable>
          )}
        </View>

        <View style={styles.headerCenter}>
          {title ? (
            <Text style={[type.bodyStrong, { color: tint, textAlign: 'center' }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {step ? (
            <Text style={[type.caption, { color: tone === 'dark' ? colors.onDarkMuted : colors.muted }]}>
              Step {step.current} of {step.total}
            </Text>
          ) : null}
        </View>

        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
      </View>

      {step ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step.current / step.total) * 100}%` }]} />
        </View>
      ) : null}

      {subtitle ? (
        <Text style={[type.body, styles.subtitle, tone === 'dark' && { color: colors.onDarkMuted }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Large screen title used under the compact header. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={[type.title, { color: colors.ink }]}>{title}</Text>
      {subtitle ? (
        <Text style={[type.body, { color: colors.muted, marginTop: spacing.xs }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: string; right?: React.ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[type.overline, { color: colors.muted, textTransform: 'uppercase' }]}>{children}</Text>
      {right}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  headerSide: { width: 76, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: radii.pill, backgroundColor: colors.accent },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    ...Platform.select({ web: { boxShadow: '0 -8px 24px rgba(0,0,0,0.04)' }, default: {} }),
  },
}));
