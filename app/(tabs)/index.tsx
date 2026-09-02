import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/hooks/useOnboarding';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { BASE_HAIR_COLOR, DEMO_BASE_SHAPE, DEMO_PHOTO } from '@/lib/constants';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
/** The reference lays this screen out as a narrow centred column, not full-bleed. */
const GUTTER = Math.round(width * 0.1);

/**
 * Step 1 — the photo, and nothing else.
 *
 * Browsing lives in the Styles tab; this screen stays a single decision so the
 * flow reads the way `App-reference.png` lays it out.
 */
export default function TryOnHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useOnboarding();

  const { photoUri, setPhoto } = useSession();
  const { pickFromLibrary, takePhoto, busy } = usePhotoPicker(setPhoto);

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
      <View style={[styles.body, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={[type.title, styles.title]}>
          Try a <Text style={{ color: colors.accent }}>New</Text> Hairstyle
        </Text>
        <Text style={[type.body, styles.subtitle]}>
          Upload a clear front-facing photo for the best results.
        </Text>

        {photoUri ? (
          <View style={{ gap: spacing.lg }}>
            <PhotoFrame
              uri={photoUri}
              rounded={radii.lg}
              style={{ width: 168, height: 216, alignSelf: 'center' }}
              demo={{ shape: DEMO_BASE_SHAPE, color: BASE_HAIR_COLOR }}
              demoWidth={220}
            />
            <Button label="Change photo" variant="ghost" size="md" onPress={pickFromLibrary} />
          </View>
        ) : (
          <View style={{ gap: spacing.xl }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload a photo"
              onPress={pickFromLibrary}
              disabled={busy}
              style={({ pressed }) => [styles.dropZone, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="cloud-upload" size={64} color={colors.accent} />
              <Text style={[type.heading, { color: colors.accent }]}>Upload Photo</Text>
              <Text style={[type.caption, { color: colors.muted }]}>or take a selfie</Text>
            </Pressable>

            <View style={styles.orRow}>
              <View style={styles.rule} />
              <Text style={[type.caption, { color: colors.muted }]}>or</Text>
              <View style={styles.rule} />
            </View>

            <Button label="Take a Photo" icon="camera-outline" variant="soft" size="lg" onPress={takePhoto} />
          </View>
        )}

        <Text style={[type.caption, styles.note]}>We don’t store your photos.</Text>

        {photoUri ? null : (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPhoto(DEMO_PHOTO)}>
            <Text style={[type.caption, styles.sampleLink]}>Use a sample photo</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  dropZone: {
    // Near-square, as in the reference — not a short full-width band.
    aspectRatio: 1.05,
    maxHeight: 340,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairlineStrong },
  note: { color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  sampleLink: { color: colors.muted, textAlign: 'center', marginTop: spacing.md, textDecorationLine: 'underline' },
});
