import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import type { Gender, HairColor, HairShape, TryOnOptions, VariantId } from '@/api/types';
import { Mannequin } from '@/components/Mannequin';
import { DEMO_PHOTO } from '@/lib/constants';
import { colors, radii, spacing, type } from '@/theme/theme';

export interface DemoSubject {
  /** The style being tried on, so the generated render is used when there is one. */
  styleId?: string | null;
  shape: HairShape;
  color?: HairColor | null;
  options?: TryOnOptions;
  gender?: Gender | null;
  /** Which renders of the style are acceptable — see `<Mannequin variants>`. */
  variants?: VariantId[] | null;
}

interface PhotoFrameProps {
  uri: string | null;
  /**
   * Overlay wash marking a *simulated* "after" as different from the original.
   *
   * Null on a real preview, always. It is a flat colour over the whole frame,
   * so on an image the model actually changed it is a cast on skin, clothes and
   * hair rather than a label.
   */
  tint?: string | null;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  emptyLabel?: string;
  /** What to draw when the sample photo is in use. */
  demo?: DemoSubject;
  /** Width hint so the sample mannequin fills the frame. */
  demoWidth?: number;
}

/**
 * Renders the user's photo, the sample mannequin, or a neutral placeholder.
 *
 * `tint` is a leftover of the era before Fal.ai was wired up, when a "generated"
 * result was the original photo and a subtle wash over it was the only thing
 * making a before/after comparison legible. Generation is real now, so every
 * caller passes it only for a look that was simulated — see the prop.
 */
export function PhotoFrame({
  uri,
  tint,
  rounded = radii.xl,
  style,
  children,
  emptyLabel = 'No photo yet',
  demo,
  demoWidth = 300,
}: PhotoFrameProps) {
  const isDemo = uri === DEMO_PHOTO;

  return (
    <View style={[styles.frame, { borderRadius: rounded }, style]}>
      {isDemo ? (
        <View style={[StyleSheet.absoluteFill, styles.demo]}>
          {demo ? (
            <Mannequin
              styleId={demo.styleId}
              shape={demo.shape}
              options={demo.options}
              color={demo.color}
              gender={demo.gender}
              variants={demo.variants}
              size={demoWidth}
              backdrop={null}
            />
          ) : null}
        </View>
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.empty]}>
          <View style={styles.emptyBadge}>
            <Ionicons name="person-outline" size={26} color={colors.muted} />
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>{emptyLabel}</Text>
        </View>
      )}
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  demo: { alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#E8E1D8' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyBadge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
