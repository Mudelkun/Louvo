import React, { useId, useMemo } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { Gender, HairColor, HairShape, TryOnOptions } from '@/api/types';
import { buildHairPaths, effectiveShape, headFor, type ViewAngle } from '@/lib/hairShape';
import { colors as tokens } from '@/theme/theme';

interface MannequinProps {
  shape: HairShape;
  /** Live customisation overrides — the mannequin re-renders as the user adjusts. */
  options?: TryOnOptions;
  color?: HairColor;
  gender?: Gender | null;
  /** Camera angle. The catalog shows every style from the front, side and back. */
  angle?: ViewAngle;
  size?: number;
  /** Background wash behind the mannequin. Pass `null` for transparent. */
  backdrop?: string | null;
  style?: ViewStyle;
}

const SKIN_LIGHT = '#F0E8DE';
const SKIN_MID = '#E1D5C7';
const SKIN_SHADOW = '#CBBCAA';

/**
 * The neutral, faceless mannequin every hairstyle is modelled on.
 *
 * No facial features, no ethnicity cues, identical proportions for every style —
 * the only thing that changes between two cards is the hair itself.
 */
export function Mannequin({
  shape,
  options,
  color,
  gender,
  angle = 'front',
  size = 160,
  backdrop = '#EFE9E1',
  style,
}: MannequinProps) {
  // SVG gradient ids share one namespace per document on web, so every instance
  // needs its own or later mannequins reference a stale (or missing) gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const resolved = useMemo(() => effectiveShape(shape, options), [shape, options]);
  const paths = useMemo(() => buildHairPaths(resolved, angle), [resolved, angle]);

  const hair = color?.hex ?? '#3B2A21';
  const hairShade = color?.shade ?? '#241811';
  const head = headFor(angle);
  const { cx, cy, rx, ry, viewBox, neckTop, neckBottom, neckHalfWidth } = head;
  const height = (size * viewBox.height) / viewBox.width;

  // A slightly narrower jaw and longer neck read as the feminine variant without
  // adding any facial features.
  const jawScale = gender === 'female' ? 0.94 : 1;
  const headRx = rx * jawScale;

  // In profile the head sits forward of the spine, so the neck and shoulders
  // shift back; from the side the shoulders are a lot narrower than head-on.
  const profile = angle === 'side';
  const neckCx = cx + (profile ? -7 : 0);
  const shoulderScale = profile ? 0.78 : 1;

  return (
    <View style={[{ width: size, height }, style]}>
      <Svg width={size} height={height} viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}>
        <Defs>
          <LinearGradient id={`skin${uid}`} x1="0.15" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor={SKIN_LIGHT} />
            <Stop offset="0.62" stopColor={SKIN_MID} />
            <Stop offset="1" stopColor={SKIN_SHADOW} />
          </LinearGradient>
          <LinearGradient id={`hairGrad${uid}`} x1="0.2" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={hair} />
            <Stop offset="1" stopColor={hairShade} />
          </LinearGradient>
          <LinearGradient id={`wash${uid}`} x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {backdrop ? <Rect x="0" y="0" width={viewBox.width} height={viewBox.height} fill={backdrop} /> : null}
        {backdrop ? <Rect x="0" y="0" width={viewBox.width} height={viewBox.height} fill={`url(#wash${uid})`} /> : null}

        {/* Hair falling behind the head */}
        {paths.back ? <Path d={paths.back} fill={`url(#hairGrad${uid})`} /> : null}
        {paths.tail ? <Path d={paths.tail} fill={`url(#hairGrad${uid})`} /> : null}

        {/* Shoulders */}
        <G transform={`translate(${cx} 0) scale(${shoulderScale} 1) translate(${-cx} 0)`}>
          <Path
            d={`M 4 ${viewBox.height} C 10 206 46 186 ${cx - 26} 176 L ${cx + 26} 176 C ${
              viewBox.width - 46
            } 186 ${viewBox.width - 10} 206 ${viewBox.width - 4} ${viewBox.height} Z`}
            fill={SKIN_MID}
          />
        </G>

        {/* Neck */}
        <Path
          d={`M ${neckCx - neckHalfWidth} ${neckTop} L ${neckCx - neckHalfWidth + 1} ${neckBottom} Q ${neckCx} ${
            neckBottom + 8
          } ${neckCx + neckHalfWidth - 1} ${neckBottom} L ${neckCx + neckHalfWidth} ${neckTop} Z`}
          fill={SKIN_SHADOW}
        />

        {/* Head — deliberately featureless */}
        <G>
          <Ellipse cx={cx} cy={cy} rx={headRx} ry={ry} fill={`url(#skin${uid})`} />
          <Ellipse cx={cx - rx * 0.34} cy={cy - ry * 0.1} rx={rx * 0.42} ry={ry * 0.5} fill="#FFFFFF" opacity={0.28} />
          <Ellipse cx={cx + rx * 0.55} cy={cy + ry * 0.24} rx={rx * 0.34} ry={ry * 0.44} fill={SKIN_SHADOW} opacity={0.35} />
          {/* Ears only show on styles short enough to leave them uncovered — and
              from behind there is no ear to draw at all. */}
          {resolved.sides < 0.45 && angle !== 'back' ? (
            profile ? (
              <Ellipse cx={cx - headRx * 0.28} cy={cy + ry * 0.16} rx={7.2} ry={9.4} fill={SKIN_MID} />
            ) : (
              <>
                <Ellipse cx={cx - headRx} cy={cy + ry * 0.16} rx={4.6} ry={8.4} fill={SKIN_MID} />
                <Ellipse cx={cx + headRx} cy={cy + ry * 0.16} rx={4.6} ry={8.4} fill={SKIN_MID} />
              </>
            )
          ) : null}
        </G>

        {/* Hair in front of the head */}
        {paths.sideLeft ? <Path d={paths.sideLeft} fill={`url(#hairGrad${uid})`} /> : null}
        {paths.sideRight ? <Path d={paths.sideRight} fill={`url(#hairGrad${uid})`} /> : null}
        <Path d={paths.cap} fill={`url(#hairGrad${uid})`} />
        {paths.part ? <Path d={paths.part} stroke={hairShade} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} /> : null}
        {paths.knot ? <Circle cx={paths.knot.cx} cy={paths.knot.cy} r={paths.knot.r} fill={`url(#hairGrad${uid})`} /> : null}
      </Svg>
    </View>
  );
}

/** Small circular avatar version used in lists and headers. */
export function MannequinBadge({
  shape,
  color,
  size = 44,
}: {
  shape: HairShape;
  color?: HairColor;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: tokens.surfaceAlt,
        alignItems: 'center',
      }}
    >
      <Mannequin shape={shape} color={color} size={size * 1.5} backdrop={null} style={{ marginTop: -size * 0.1 }} />
    </View>
  );
}
