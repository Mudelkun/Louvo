import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Gender, HairColor, HairShape, VariantId } from '@/api/types';
import { Mannequin } from '@/components/Mannequin';
import { DEMO_PHOTO } from '@/lib/constants';
// The one component that reads the light palette directly, on purpose. This
// card is captured as an image and posted somewhere else: what it looks like is
// a fact about Luvo's branding, not about the phone that made it. Two people
// sharing the same look must produce the same picture.
import { lightColors as colors, type } from '@/theme/theme';

/**
 * The image people actually post.
 *
 * Not the raw preview. A generated preview is a photograph of somebody with a
 * different haircut and nothing about it says where it came from — shared as it
 * is, it is a nice picture that advertises nothing. This composition is the same
 * picture with the smallest possible amount of Luvo on it, and every decision
 * in here is about keeping "smallest possible" true, because **the moment the
 * branding is big enough to be embarrassing, nobody posts it and the reach goes
 * to zero.** An ad nobody sends is worth less than no ad.
 *
 * So: one line, bottom-left, over a gradient that is already there to make the
 * bottom edge of a photograph readable. No frame, no border, no watermark
 * tiling, no logo in the middle, nothing in the top two thirds where a face is.
 *
 * ## Why it is a view rather than a composite
 *
 * There is no image compositor on the device — `expo-image-manipulator` crops,
 * scales and rotates and cannot draw. The alternatives were to send the finished
 * preview back to a server with `sharp` on it, which would undo the entire
 * privacy design (`docs/preview-generation.md`: the preview lives on the phone
 * and nowhere else), or to render it as a view and photograph the view. The
 * second is what `react-native-view-shot` is for, it costs nothing, and it keeps
 * the picture on the device.
 *
 * The consequence to keep in mind: **this component is measured in points and
 * captured at a multiple of them.** `captureShareCard` renders it at
 * `CARD_WIDTH` points and asks for a 1080px-wide output, so every size in here
 * is multiplied by three on the way out. Type set at 13pt lands at 39px, which
 * is why the branding reads at a glance in a feed and still occupies almost none
 * of the frame.
 */

/** Layout width in points. The capture scales this to `EXPORT_WIDTH`. */
export const CARD_WIDTH = 360;

/**
 * The exported width in pixels.
 *
 * 1080 is what Instagram, WhatsApp and Facebook all resample to, so anything
 * larger is bytes thrown away by somebody else's encoder and anything smaller is
 * visibly soft on a modern phone. It is also exactly 3x `CARD_WIDTH`, which
 * keeps the arithmetic in this file legible.
 */
export const EXPORT_WIDTH = 1080;

/**
 * The card's aspect, from the picture's own.
 *
 * Clamped rather than fixed, and the clamp is the whole point. A fixed 4:5 frame
 * would `cover`-crop a tall selfie, and what a tall selfie loses to a crop is the
 * top of the head — which is the haircut, which is the subject. So the card takes
 * the photograph's own shape wherever it can, and only the extremes are pulled
 * in: nothing wider than square, because a landscape post is a small post, and
 * nothing taller than 4:5.5, past which feeds crop it themselves.
 *
 * A preview whose size could not be measured falls back to 4:5 — Instagram's own
 * best feed ratio, and the shape most phone photographs are nearest to.
 */
const MIN_ASPECT = 0.72;
const MAX_ASPECT = 1;
export const DEFAULT_ASPECT = 0.8;

export function cardAspect(size: { width: number; height: number } | null): number {
  if (!size || size.width <= 0 || size.height <= 0) return DEFAULT_ASPECT;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, size.width / size.height));
}

export interface ShareCardProps {
  /** The finished preview. Null or the sample sentinel draws the mannequin. */
  uri: string | null;
  hairstyleName: string;
  aspect?: number;
  /** What to draw when the look is the sample photo, which has no pixels. */
  demo?: { styleId: string; shape: HairShape; color?: HairColor | null; gender?: Gender | null; variants?: VariantId[] | null };
}

/**
 * The card, laid out for capture.
 *
 * Rendered off-screen by the share screen and never scrolled into view, so it
 * has no accessibility affordances and no press targets on purpose: it is a
 * drawing being photographed, not a control. What the user sees is the preview
 * inside `<SharePreviewCard>` below, which is this same component at a size that
 * fits on a screen.
 */
export function ShareCard({ uri, hairstyleName, aspect = DEFAULT_ASPECT, demo }: ShareCardProps) {
  const height = Math.round(CARD_WIDTH / aspect);
  const isDemo = !uri || uri === DEMO_PHOTO;

  return (
    <View style={[styles.card, { width: CARD_WIDTH, height }]} collapsable={false}>
      {isDemo ? (
        <View style={[StyleSheet.absoluteFill, styles.demo]}>
          {demo ? (
            <Mannequin
              styleId={demo.styleId}
              shape={demo.shape}
              color={demo.color}
              gender={demo.gender}
              variants={demo.variants}
              size={CARD_WIDTH * 0.86}
              backdrop={null}
            />
          ) : null}
        </View>
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      )}

      {/* The scrim earns its place twice: it is what makes a white shirt or a
          bright wall at the bottom of a photograph readable behind text, and it
          is the reason the branding needs no box, no pill and no background of
          its own. Short — 34% of the frame, fading to nothing — so it reads as
          the bottom of a photograph rather than as a banner stuck on one. */}
      <LinearGradient
        colors={['rgba(10,7,18,0)', 'rgba(10,7,18,0.34)', 'rgba(10,7,18,0.72)']}
        locations={[0, 0.45, 1]}
        style={[styles.scrim, { height: Math.round(height * 0.34) }]}
        pointerEvents="none"
      />

      <View style={styles.footer}>
        <View style={styles.mark}>
          <View style={styles.markIcon}>
            <Ionicons name="cut" size={13} color={colors.ink} />
          </View>
          <Text style={styles.wordmark}>Luvo</Text>
        </View>
        {/* The cut's name is the caption a stranger actually wants — it answers
            "what is that haircut called", which is the only question a good
            result provokes. It sits under the wordmark rather than beside it so
            a long name elides instead of pushing the brand off the card. */}
        <Text style={styles.cut} numberOfLines={1}>
          {hairstyleName}
        </Text>
      </View>
    </View>
  );
}

/**
 * The same card at whatever size the screen has room for.
 *
 * A separate component rather than a `scale` prop, because the capture must
 * happen at exactly `CARD_WIDTH` — a view-shot of a transformed view is a
 * transformed capture — so the on-screen copy is a second render rather than the
 * same one shrunk. It costs one extra decode of an image already in the cache,
 * and it buys a preview that is genuinely what gets sent.
 */
export function SharePreviewCard({
  width,
  ...props
}: ShareCardProps & { width: number }) {
  const scale = width / CARD_WIDTH;
  const height = Math.round(CARD_WIDTH / (props.aspect ?? DEFAULT_ASPECT));
  return (
    <View style={{ width, height: Math.round(height * scale), overflow: 'hidden', borderRadius: 20 }}>
      <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
        <ShareCard {...props} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No rounded corners and no border: this is a photograph being posted, and
  // every app it lands in applies its own frame. A card with corners of its own
  // shows them as dark notches inside somebody else's rounded thumbnail.
  card: { backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  demo: { alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#E7E2F1' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 3 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.onDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    ...type.label,
    fontSize: 14,
    color: colors.onDark,
    letterSpacing: 0.2,
  },
  /**
   * The one deliberately quiet line. `onDarkMuted` at 11pt is legible against
   * the scrim and invisible from across a room, which is the correct amount of
   * loud for a label on somebody else's face.
   */
  cut: {
    ...type.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onDarkMuted,
    letterSpacing: 0.3,
  },
});
