import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { PhotoFrame } from '@/components/PhotoFrame';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { BASE_HAIR_COLOR, DEMO_BASE_SHAPE, DEMO_PHOTO } from '@/lib/constants';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

interface PhotoChooserProps {
  photoUri: string | null;
  onPick: (uri: string) => void;
  /** Offers the stand-in photo for anyone who wants to look before they upload. */
  sample?: boolean;
}

/**
 * The photo step's body: the drop zone, the two ways in, and the picture once
 * there is one.
 *
 * One component because there are two screens that ask for a photo and there
 * must not be two answers to how it is asked. The home tab is where a returning
 * user starts — the photo is the whole screen and the questions come after it —
 * and the guided first run asks for it third, once gender and hair type have
 * said what the app is going to do with it. Same control, same wording, same
 * promise underneath; only the title above it and the button below it differ,
 * so both of those belong to the screen rather than to this.
 *
 * It owns no layout outside itself: no page padding, no title. The caller places
 * it.
 */
export function PhotoChooser({ photoUri, onPick, sample = true }: PhotoChooserProps) {
  const styles = useStyles();
  const colors = useColors();
  const { pickFromLibrary, takePhoto, busy } = usePhotoPicker(onPick);

  if (photoUri) {
    return (
      <View style={{ gap: spacing.lg }}>
        <PhotoFrame
          uri={photoUri}
          rounded={radii.lg}
          style={{ width: 168, height: 216, alignSelf: 'center' }}
          demo={{ shape: DEMO_BASE_SHAPE, color: BASE_HAIR_COLOR }}
          demoWidth={220}
        />
        <Button label="Change photo" variant="ghost" size="md" onPress={pickFromLibrary} />
        <Text style={[type.caption, styles.note]}>We don’t store your photos.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xl }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upload a photo"
        onPress={pickFromLibrary}
        disabled={busy}
        style={({ pressed }) => [
          styles.dropZone,
          pressed && { backgroundColor: colors.surfaceAlt },
        ]}
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

      <View style={{ gap: spacing.md }}>
        <Text style={[type.caption, styles.note]}>We don’t store your photos.</Text>
        {sample ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onPick(DEMO_PHOTO)}>
            <Text style={[type.caption, styles.sampleLink]}>Use a sample photo</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
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
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineStrong,
  },
  note: { color: colors.muted, textAlign: 'center' },
  sampleLink: {
    color: colors.muted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
}));
