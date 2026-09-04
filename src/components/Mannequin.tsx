import React, { useId, useMemo } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeColorMatrix,
  Filter,
  G,
  Image as SvgImage,
  LinearGradient,
  Mask,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import type { Gender, HairColor, HairShape, TryOnOptions, VariantId } from '@/api/types';
import { hairGrade } from '@/lib/colorGrade';
import { baseHairColor } from '@/lib/constants';
import { buildHairPaths, effectiveShape, headFor, HERO_ANGLE, turnFor, type ViewAngle } from '@/lib/hairShape';
import { ANCHOR_LENGTH, parseLength } from '@/lib/hairLengths';
import { mannequinMask, mannequinRender, renderLength, renderVariant } from '@/lib/mannequinRender';
import { colors as tokens } from '@/theme/theme';

interface MannequinProps {
  /**
   * The hairstyle this is drawing. Given one, the generated mannequin render is
   * used when it exists and the procedural drawing is the fallback — so a style
   * starts showing its real image the moment the generator produces it.
   */
  styleId?: string | null;
  shape: HairShape;
  /** Live customisation overrides — the mannequin re-renders as the user adjusts. */
  options?: TryOnOptions;
  /**
   * The shade to draw the hair in. The procedural drawing is painted in it
   * directly; a generated render is colour-graded to it (`src/lib/colorGrade.ts`),
   * since the render exists in exactly one shade.
   */
  color?: HairColor | null;
  gender?: Gender | null;
  /**
   * Which renders of this style are acceptable, best first — the output of
   * `variantCandidates(style, hairType)`. One entry once the user has declared a
   * hair type, several under "All Types", and omitted entirely by the callers
   * that are not drawing a catalog hairstyle at all.
   *
   * A style whose wanted variant has not been generated yet falls through to
   * the procedural drawing, exactly as an ungenerated style always has: showing
   * someone the curly render of a cut they asked to see straight would be a
   * wrong image rather than a partial one.
   */
  variants?: VariantId[] | null;
  /** Camera angle. The catalog shows every style dead-on, three-quarter, in profile and from behind. */
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
  styleId,
  shape,
  options,
  color,
  gender,
  variants,
  angle = 'front',
  size = 160,
  backdrop = '#EFE9E1',
  style,
}: MannequinProps) {
  // SVG gradient ids share one namespace per document on web, so every instance
  // needs its own or later mannequins reference a stale (or missing) gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // Resolved once, then used for both the render and its mask, so the graded
  // copy is always masked by the mask belonging to the image underneath it.
  //
  // The length comes off `options` rather than a prop of its own: it is a live
  // customisation the user is making to this cut, which is exactly what that
  // prop already means, and it is already carried there for the procedural
  // drawing. A stop with no render of its own resolves to the anchor, so the
  // resolved value is read back rather than assumed — the mask below has to
  // belong to the image that actually got picked, and on a longer cut the
  // anchor's mask would hold the grade to the wrong pixels.
  const wanted = parseLength(options?.length) ?? ANCHOR_LENGTH;
  const variant = renderVariant(styleId, gender, angle, variants, wanted);
  const length = renderLength(styleId, gender, angle, variants, wanted) ?? ANCHOR_LENGTH;
  const render = mannequinRender(styleId, gender, angle, variant ? [variant] : variants, wanted);
  // The grade is anchored to the shade *this* render was shot in, not to one
  // catalog-wide shade: the coily variant is shot in black and everything else
  // in espresso, so grading a coily render from the espresso anchor would
  // overshoot every target. See BASE_HAIR_COLORS.
  const anchor = baseHairColor(variant);
  const grade = useMemo(() => hairGrade(color, anchor.hex), [color, anchor.hex]);
  const hairOnly = grade && variant ? mannequinMask(styleId, gender, angle, [variant], length) : null;

  // The render is square, but the box it sits in is the drawing's, so a grid of
  // half-generated styles keeps one row height.
  const { viewBox } = headFor(angle);
  const height = (size * viewBox.height) / viewBox.width;

  // The drawing is a separate component rather than a branch of this one so that
  // building its paths is not work a rendered style pays for. Every caller
  // rebuilds `shape` inline — the texture depends on the hair type — so the
  // memo below never held, and a hair-type switch was recomputing four dozen
  // bezier segments for eight mannequins that were all about to draw a PNG.
  if (!render) {
    return (
      <MannequinDrawing
        shape={shape}
        options={options}
        color={color}
        gender={gender}
        angle={angle}
        size={size}
        backdrop={backdrop}
        style={style}
      />
    );
  }

  // The render is a square portrait of the same head, so it is laid into the top
  // of the same box the drawing occupies: every caller keeps its layout, and a
  // grid of half-generated styles still lines up.
  return (
    <View style={[{ width: size, height }, backdrop ? { backgroundColor: backdrop } : null, style]}>
      {/* Recolouring goes through SVG rather than expo-image because a filter is
          the only thing in this stack that can rewrite pixels: the render is one
          shade and the shade the user picked is a grade of it.

          The graded render is drawn twice. Underneath, untouched; on top, graded
          and held inside the hair mask, so the mannequin and the backdrop below
          are the original pixels and only the haircut is recoloured. Without a
          mask the graded copy covers the frame, which is close but not exact:
          the grade is anchored at white, so it barely moves white plastic, but
          "barely" is still a tint on the head and it lands hardest on the one
          dark thing that is not hair — the shadow under the jaw.

          An ungraded render used to take a separate `<Image>` path, on the
          grounds that the default shade costs nothing and no filter need exist.
          It cost something else. Whether a render is graded depends on the shade
          *it* was shot in — `curly` and `coily` are black, everything else
          espresso — so two chips a hair type apart could land on different
          branches of that ternary, and switching between them unmounted one
          component and mounted the other: the picture went blank and faded back
          in. That is the flash a hair-type switch is least able to afford. One
          tree, and the filter is the only thing that comes and goes. */}
      <Svg width={size} height={size}>
        <Defs>
          {grade ? (
            <Filter id={`grade${uid}`} x="0" y="0" width="100%" height="100%">
              <FeColorMatrix type="matrix" values={grade} />
            </Filter>
          ) : null}
          {hairOnly ? (
            <Mask id={`hair${uid}`} x="0" y="0" width="100%" height="100%">
              <SvgImage
                href={hairOnly}
                x={0}
                y={0}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid meet"
              />
            </Mask>
          ) : null}
        </Defs>

        {hairOnly ? (
          <SvgImage href={render} x={0} y={0} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
        ) : null}
        <G mask={hairOnly ? `url(#hair${uid})` : undefined}>
          <SvgImage
            href={render}
            x={0}
            y={0}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            filter={grade ? `url(#grade${uid})` : undefined}
          />
        </G>
      </Svg>
    </View>
  );
}

interface MannequinDrawingProps {
  shape: HairShape;
  options?: TryOnOptions;
  color?: HairColor | null;
  gender?: Gender | null;
  angle?: ViewAngle;
  size?: number;
  backdrop?: string | null;
  style?: ViewStyle;
}

/**
 * The procedural mannequin — the fallback for a style with no render yet, drawn
 * from its `shape` descriptor.
 *
 * Its own component rather than the other half of an `if` in `<Mannequin>`, so
 * that a style *with* a render never builds a path it is not going to draw.
 * That mattered once the hair-type chips arrived: `shape` is rebuilt inline by
 * every caller (the texture depends on the type being shown), so the memos below
 * miss on every render, and switching type made eight mannequins solve a few
 * hundred bezier points each on the way to swapping two PNGs.
 */
function MannequinDrawing({
  shape,
  options,
  color,
  gender,
  angle = 'front',
  size = 160,
  backdrop = '#EFE9E1',
  style,
}: MannequinDrawingProps) {
  // As in `<Mannequin>`: gradient ids share one namespace per document on web.
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

  // The head sits forward of the spine, so the further it turns the further the
  // neck falls behind it and the narrower the shoulders read.
  const turn = turnFor(angle);
  const neckCx = cx - 7 * turn;
  const shoulderScale = 1 - 0.22 * turn;

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
              from behind there is no ear to draw at all. Turning the head slides
              the near ear towards the middle of the skull and foreshortens the
              far one until the profile hides it completely. */}
          {resolved.sides < 0.45 && angle !== 'back' ? (
            <>
              <Ellipse
                cx={cx - headRx * (1 - 0.72 * turn)}
                cy={cy + ry * 0.16}
                rx={4.6 + 2.6 * turn}
                ry={8.4 + turn}
                fill={SKIN_MID}
              />
              {turn < 1 ? (
                <Ellipse
                  cx={cx + headRx * (1 - 0.16 * turn)}
                  cy={cy + ry * 0.16}
                  rx={4.6 * (1 - turn)}
                  ry={8.4 - 1.4 * turn}
                  fill={SKIN_MID}
                />
              ) : null}
            </>
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
  styleId,
  shape,
  color,
  gender,
  variants,
  size = 44,
}: {
  styleId?: string | null;
  shape: HairShape;
  color?: HairColor | null;
  gender?: Gender | null;
  variants?: VariantId[] | null;
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
      <Mannequin
        styleId={styleId}
        shape={shape}
        color={color}
        gender={gender}
        variants={variants}
        angle={HERO_ANGLE}
        size={size * 1.5}
        backdrop={null}
        style={{ marginTop: -size * 0.1 }}
      />
    </View>
  );
}
