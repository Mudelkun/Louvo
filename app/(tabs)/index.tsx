import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadgeRow } from '@/components/CreditBadge';
import { PhotoChooser } from '@/components/PhotoChooser';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/state/OnboardingContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, spacing, useColors, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
/** The reference lays this screen out as a narrow centred column, not full-bleed. */
const GUTTER = Math.round(width * 0.1);

/**
 * Home, and the first step for anyone who has been here before.
 *
 * The photo, and nothing else — browsing lives in the Styles tab, and the two
 * questions that decide which catalog exists are asked after it, on the way to
 * the grid. That is the opposite order from the guided first run
 * (`OnboardingContext` says why), and deliberately: a returning user knows what
 * the app does and the photo is the only thing standing between them and it.
 *
 * The chooser itself is shared with that run, so both ask in exactly one way.
 */
export default function TryOnHomeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useOnboarding();

  const { photoUri, setPhoto } = useSession();

  if (status === 'unknown') return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (status === 'unseen') return <Redirect href="/welcome" />;

  return (
    <Screen
      padded={false}
      scroll={false}
      contentStyle={{ flex: 1 }}
      footer={
        photoUri ? (
          <Button label="Continue" iconRight="arrow-forward" onPress={() => router.push('/try/gender')} />
        ) : undefined
      }
    >
      <CreditBadgeRow paddingTop={insets.top + spacing.md} />
      <View style={[styles.body, { paddingTop: spacing.lg }]}>
        <Text style={[type.title, styles.title]}>
          Try a <Text style={{ color: colors.accent }}>New</Text> Hairstyle
        </Text>
        <Text style={[type.body, styles.subtitle]}>
          Upload a clear front-facing photo for the best results.
        </Text>

        <PhotoChooser photoUri={photoUri} onPick={setPhoto} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
}));
