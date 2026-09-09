'use client';

/**
 * A hairstyle, on the white ground it was shot on.
 *
 * The web's `<Mannequin>`, and it resolves in the same order for the same
 * reasons: the catalog's render for this style / variant / length / gender /
 * angle if one has been generated, and the procedural drawing built from the
 * style's `shape` descriptor if not. There is no placeholder in between —
 * a half-generated catalog is a *mix* rather than a wrong image, which is what
 * lets the whole catalog be browsable while the generator works through it.
 *
 * ## The plate is white, and that is not a scheme decision
 *
 * Every render is shot on flat white. Put one on a dark card and the seam falls
 * exactly on the render's own edge, drawing a bright rectangle inside the frame.
 * A tinted plate does not fix it either — a warm or cool ground leaves a visible
 * square in *both* schemes. So the plate is the render's own white, the card's
 * border and its caption row carry the scheme, and text drawn *on* a plate comes
 * from the light end of the palette (`--color-on-plate`). That is the whole cost
 * of the decision and it is bounded: anything drawn on a render needs those
 * tokens, and nothing else does.
 *
 * ## The grade
 *
 * The catalog is shot in two shades — espresso for `any`/`straight`/`wavy`,
 * black for `curly`/`coily` — so an ungraded grid puts a brown cut beside a
 * black one and the difference reads as a colour nobody chose. The fix is one
 * `feColorMatrix` per shade pair, held to the hair by the render's own mask, and
 * `lib/colorGrade.ts` is the maths.
 *
 * Two properties make it cheap. The filter is **null when the target already is
 * the shade this render was shot in**, which under the default jet is most of
 * the curly and coily catalog — no filter, no second layer, nothing. And a
 * render with **no mask is graded whole rather than not at all**: the documented
 * degraded path, close but for a slight tint on the jaw shadow.
 */

import { memo, useId, useMemo, useState } from 'react';

import { baseHairColor, hairGrade } from '../lib/colorGrade';
import type { Gender, HairColor, HairShape, HairTypeId, VariantId, ViewAngle } from '../lib/contract/catalog';
import { buildHairPaths, effectiveShape, headFor, turnFor } from '../lib/contract/hairShape';
import type { ResolvedRender } from '../lib/renders';

const SKIN_LIGHT = '#F0E8DE';
const SKIN_MID = '#E1D5C7';
const SKIN_SHADOW = '#CBBCAA';

export interface PlateProps {
  /** The render to draw, or null to fall through to the drawing. */
  render: ResolvedRender | null;
  /** The style's shape descriptor, for the fallback drawing. */
  shape: HairShape;
  /** The texture the drawing should use — see `textureFor()`. */
  texture?: HairShape['texture'];
  color: HairColor | null;
  gender?: Gender | null;
  angle?: ViewAngle;
  /** Names the image for assistive technology. Never decorative here. */
  alt: string;
  /** Passed to the `<img>`; `eager` for a hero, lazy for a grid. */
  priority?: boolean;
  /**
   * How the render sits in its box, and the reason this is a prop rather than a
   * class the caller adds.
   *
   * `contain` is the default and is right nearly everywhere: a card, a tile and
   * a square hero all give the render a box of roughly its own shape, and
   * contain is the only fit that cannot cut anything off.
   *
   * `cover-top` is for a box much wider than it is tall — the phone deck on the
   * style page, which is whatever height the window has left. Contained there,
   * a square render is drawn at the box's *height* and the picture is a small
   * head between two white margins; covered, it is drawn at the box's *width*
   * and the crop comes off the bottom, which on these renders is the display
   * base and the lower neck rather than any of the haircut. Measured: the
   * subject fills 95% of a render's height and 76% of its width, so there is no
   * top margin to spend and the only safe crop is downward from the crown.
   *
   * It has to be a prop because the base `<img>` and the SVG that carries the
   * colour grade are two elements fitted independently, and a grade fitted
   * `meet` over an image fitted `slice` is a recoloured hairline sitting an inch
   * from the hair. `object-top` and `xMidYMin slice` are the same rule written
   * twice, which is exactly why neither may be set without the other.
   */
  fit?: PlateFit;
  className?: string;
}

/** See `fit` on `<Plate>`. */
export type PlateFit = 'contain' | 'cover-top';

/** The two halves of one fit, so they cannot be set apart. */
const FIT: Record<PlateFit, { img: string; svg: string }> = {
  contain: { img: 'object-contain', svg: 'xMidYMid meet' },
  'cover-top': { img: 'object-cover object-top', svg: 'xMidYMin slice' },
};

/**
 * One graded render: the original, plus a recoloured copy held to the hair.
 *
 * Two stacked layers rather than one filtered image, because the grade must not
 * touch the mannequin or the backdrop. Only the masked copy carries the filter,
 * so the head and the ground stay the original pixels.
 *
 * ## Why the overlay is an inline `<svg>` and not a CSS mask
 *
 * This is the one thing here that must not be "simplified" back. The obvious
 * implementation is a second `<img>` with `filter` and `mask-image`, and it is
 * wrong on the web for a reason that does not exist on a phone: **CSS
 * `mask-image` fetches in CORS mode.** The catalogue's CDN serves the renders
 * public and immutable with no `Access-Control-Allow-Origin`, so the mask
 * request is rejected, the masked element is treated as fully masked out, and
 * the grade silently disappears.
 *
 * What that looks like is not a broken image — it is a *correct-looking* grid
 * with two hair colours in it, because `any`/`straight`/`wavy` are shot espresso
 * and `curly`/`coily` are shot black. In other words the exact defect the grade
 * exists to remove, reintroduced by a fetch nobody sees fail.
 *
 * An SVG `<mask>` containing an `<image>` has no such rule: it paints
 * cross-origin content without CORS, because nothing is ever read back. So the
 * overlay is an `<svg>` whose viewBox is the render's own pixel dimensions,
 * which also makes it align exactly with the `object-contain` base image
 * underneath — both use `xMidYMid meet` over the same box.
 *
 * `react-native-svg` has no equivalent problem, which is why the app's
 * `<Mannequin>` can do this with a plain masked layer and why this never showed
 * up there.
 */
function GradedRender({
  resolved,
  target,
  alt,
  priority,
  fit,
}: {
  resolved: ResolvedRender;
  target: string | null;
  alt: string;
  priority?: boolean;
  fit: PlateFit;
}) {
  const base = baseHairColor(resolved.variant as VariantId);
  const matrix = useMemo(() => hairGrade(target, base), [target, base]);

  /**
   * Ids are per instance rather than derived from the colours.
   *
   * A deterministic id would let forty cards showing one shade share a single
   * filter, which sounds like the better trade until two of them are on screen
   * at once: duplicate ids in one document are invalid, and which definition
   * wins is not something to rely on. `useId` is unique by construction and the
   * duplication is a handful of nodes.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { url, maskUrl, width, height } = resolved.ref;

  /**
   * The overlay mounts only once the base image has loaded.
   *
   * It is what restores `loading="lazy"`. An SVG `<image>` has no lazy
   * attribute, so an eagerly mounted overlay would pull every render in a
   * 56-card grid on first paint — the whole catalogue, above and below the fold.
   * Gating on the base image's own load event gives the overlay the base's lazy
   * behaviour for free, and the graded layer arrives a frame after the pixels it
   * is grading.
   */
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- the renders are
          already WebP at the size a card draws them; see next.config.ts. */}
      <img
        src={url}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full ${FIT[fit].img}`}
      />

      {matrix && loaded ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          // The other half of `fit`. See the prop.
          preserveAspectRatio={FIT[fit].svg}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
          focusable="false"
        >
          <defs>
            <filter id={`grade${uid}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={matrix.join(' ')} />
            </filter>
            {/* A render whose mask failed to compute is graded *whole* rather
                than not at all — the documented degraded path. It tints the jaw
                shadow slightly and is much closer than leaving two shades in
                one grid. */}
            {maskUrl ? (
              <mask id={`hair${uid}`}>
                <image href={maskUrl} x="0" y="0" width={width} height={height} />
              </mask>
            ) : null}
          </defs>
          <image
            href={url}
            x="0"
            y="0"
            width={width}
            height={height}
            filter={`url(#grade${uid})`}
            {...(maskUrl ? { mask: `url(#hair${uid})` } : {})}
          />
        </svg>
      ) : null}
    </>
  );
}

/**
 * The procedural mannequin — the fallback for a style with no render.
 *
 * Its own component rather than the other half of a conditional, so a style
 * *with* a render never solves a few hundred bezier points on the way to drawing
 * a PNG. That mattered in the app as soon as the hair-type control arrived and
 * it matters more here, where a grid can be forty cards deep.
 *
 * No grade and no mask: this one is painted in the chosen hex directly, which is
 * what a drawing makes possible and a photograph does not.
 */
function Drawing({
  shape,
  texture,
  color,
  gender,
  angle = 'front',
  length,
  fit,
}: {
  fit: PlateFit;
  shape: HairShape;
  texture?: HairShape['texture'];
  color: HairColor | null;
  gender?: Gender | null;
  angle?: ViewAngle;
  length?: string | null;
}) {
  const resolved = useMemo(
    () => effectiveShape(texture ? { ...shape, texture } : shape, { length: length ?? undefined }),
    [shape, texture, length],
  );
  const paths = useMemo(() => buildHairPaths(resolved, angle), [resolved, angle]);

  const hair = color?.hex ?? '#3B2A21';
  const shade = color?.shade ?? '#241811';
  const head = headFor(angle);
  const { cx, cy, rx, ry, viewBox, neckTop, neckBottom, neckHalfWidth } = head;

  // A slightly narrower jaw and a longer neck read as the feminine variant
  // without adding any facial features.
  const headRx = rx * (gender === 'female' ? 0.94 : 1);
  const turn = turnFor(angle);
  const neckCx = cx - 7 * turn;
  const shoulderScale = 1 - 0.22 * turn;

  // Ids share one namespace per document, so two drawings on one page would
  // otherwise both resolve to the first one's gradients.
  const uid = useMemo(() => Math.random().toString(36).slice(2, 9), []);

  return (
    <svg
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio={FIT[fit].svg}
      className="absolute inset-0 h-full w-full"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`skin${uid}`} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={SKIN_LIGHT} />
          <stop offset="0.62" stopColor={SKIN_MID} />
          <stop offset="1" stopColor={SKIN_SHADOW} />
        </linearGradient>
        <linearGradient id={`hair${uid}`} x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={hair} />
          <stop offset="1" stopColor={shade} />
        </linearGradient>
      </defs>

      {paths.back ? <path d={paths.back} fill={`url(#hair${uid})`} /> : null}
      {paths.tail ? <path d={paths.tail} fill={`url(#hair${uid})`} /> : null}

      <g transform={`translate(${cx} 0) scale(${shoulderScale} 1) translate(${-cx} 0)`}>
        <path
          d={`M 4 ${viewBox.height} C 10 206 46 186 ${cx - 26} 176 L ${cx + 26} 176 C ${
            viewBox.width - 46
          } 186 ${viewBox.width - 10} 206 ${viewBox.width - 4} ${viewBox.height} Z`}
          fill={SKIN_MID}
        />
      </g>

      <path
        d={`M ${neckCx - neckHalfWidth} ${neckTop} L ${neckCx - neckHalfWidth + 1} ${neckBottom} Q ${neckCx} ${
          neckBottom + 8
        } ${neckCx + neckHalfWidth - 1} ${neckBottom} L ${neckCx + neckHalfWidth} ${neckTop} Z`}
        fill={SKIN_SHADOW}
      />

      {/* The head, deliberately featureless. */}
      <ellipse cx={cx} cy={cy} rx={headRx} ry={ry} fill={`url(#skin${uid})`} />
      <ellipse cx={cx - rx * 0.34} cy={cy - ry * 0.1} rx={rx * 0.42} ry={ry * 0.5} fill="#FFFFFF" opacity={0.28} />
      <ellipse cx={cx + rx * 0.55} cy={cy + ry * 0.24} rx={rx * 0.34} ry={ry * 0.44} fill={SKIN_SHADOW} opacity={0.35} />

      {/* Ears show only on cuts short enough to leave them uncovered, and from
          behind there is no ear to draw at all. */}
      {resolved.sides < 0.45 && angle !== 'back' ? (
        <>
          <ellipse
            cx={cx - headRx * (1 - 0.72 * turn)}
            cy={cy + ry * 0.16}
            rx={4.6 + 2.6 * turn}
            ry={8.4 + turn}
            fill={SKIN_MID}
          />
          {turn < 1 ? (
            <ellipse
              cx={cx + headRx * (1 - 0.16 * turn)}
              cy={cy + ry * 0.16}
              rx={4.6 * (1 - turn)}
              ry={8.4 - 1.4 * turn}
              fill={SKIN_MID}
            />
          ) : null}
        </>
      ) : null}

      {paths.sideLeft ? <path d={paths.sideLeft} fill={`url(#hair${uid})`} /> : null}
      {paths.sideRight ? <path d={paths.sideRight} fill={`url(#hair${uid})`} /> : null}
      <path d={paths.cap} fill={`url(#hair${uid})`} />
      {paths.part ? (
        <path d={paths.part} stroke={shade} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} fill="none" />
      ) : null}
      {paths.knot ? <circle cx={paths.knot.cx} cy={paths.knot.cy} r={paths.knot.r} fill={`url(#hair${uid})`} /> : null}
    </svg>
  );
}

/**
 * Memoised, and this is the one that pays for the rest of the page.
 *
 * A plate is a leaf: it draws an `<img>` and, when the render's shot shade is
 * not the shade on screen, a second layer carrying an `feColorMatrix` and a
 * mask. Neither depends on anything above it, and both are expensive to
 * reconcile — the front page mounts around 320 of them once the catalogue is
 * fully published (two shelves, every texture a cut was shot in, twice for the
 * marquee's second copy), and the catalogue grid another 120.
 *
 * Without this, the shared variant beat in `useVariantCycle` re-renders every
 * one of them every 4.2 seconds, and a keystroke in the catalogue's search box
 * re-renders all of them at once — in both cases to change nothing but the
 * opacity of the `<div>` a plate is sitting in. Every prop here is either a
 * primitive or an object the catalogue owns and does not rebuild (`shape` off
 * the hairstyle, `color` off the provider's memo, `render` out of a memoised
 * `renderedVariants`), so the default shallow compare is sound and the bail-out
 * is total.
 */
export const Plate = memo(function Plate({
  render,
  shape,
  texture,
  color,
  gender,
  angle = 'half',
  alt,
  priority,
  fit = 'contain',
  className = '',
}: PlateProps) {
  return (
    <div className={`relative isolate overflow-hidden bg-plate ${className}`}>
      {render ? (
        <GradedRender
          resolved={render}
          target={color?.hex ?? null}
          alt={alt}
          priority={priority}
          fit={fit}
        />
      ) : (
        <>
          <Drawing shape={shape} texture={texture} color={color} gender={gender} angle={angle} fit={fit} />
          <span className="sr-only">{alt}</span>
        </>
      )}
    </div>
  );
});

/**
 * The tier numbering, and *only* as a fallback.
 *
 * "Type 3" is a number, not an answer — it means something to somebody who has
 * read the chart and nothing to anybody else, and the one thing everybody knows
 * about their own hair is whether it is straight or curly. So every control that
 * asks the question says `catalog.hairTypes[…].name` and offers the tier as a
 * second line. This map is what is drawn in the frame before the catalogue has
 * arrived, which is also the only state in which nothing better exists.
 */
export const HAIR_TYPE_SHORT: Record<HairTypeId, string> = {
  straight: 'Type 1',
  wavy: 'Type 2',
  curly: 'Type 3',
  coily: 'Type 4',
};
