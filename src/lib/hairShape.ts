/**
 * Turns a hairstyle's `HairShape` descriptor into SVG path data for the neutral
 * mannequin.
 *
 * This exists because the AI-generated catalog imagery does not exist yet: the
 * silhouettes are derived from catalog data rather than hardcoded per style, so
 * adding a hairstyle to `mockCatalog` immediately gets a distinct render with no
 * code change. When the backend starts serving real mannequin images, the
 * `<Mannequin>` component prefers `hairstyle.imageUrl` and this becomes the
 * fallback / skeleton.
 */

import type { HairShape, TryOnOptions } from '@/api/types';

/** Camera angle a mannequin is drawn from — one style, shown from all four. */
export type ViewAngle = 'front' | 'half' | 'side' | 'back';

export const VIEW_ANGLES: ViewAngle[] = ['front', 'half', 'side', 'back'];

/**
 * The one view that stands for a style wherever only one image fits — cards,
 * badges, the style screen's opening shot.
 *
 * The three-quarter turn, because a haircut reads from it: the fringe, the
 * taper above the ear and a little of the nape are all in frame at once, where
 * dead-on hides the sides and the profile hides the front. It is the hero panel
 * the generator shoots for the same reason (`scripts/lib/prompts.mjs`).
 */
export const HERO_ANGLE: ViewAngle = 'half';

/**
 * How far the head is turned away from the camera, 0 (dead-on) .. 1 (full
 * profile). `half` is the three-quarter view, so the geometry that separates
 * front from side — skull width, where the neck sits, how far the hair wraps
 * round the near temple — is interpolated rather than special-cased per angle.
 * The head turns to the viewer's right, so the near side is the left of the
 * frame and anything behind the head moves left.
 */
const TURN: Record<ViewAngle, number> = { front: 0, half: 0.5, side: 1, back: 0 };

export const turnFor = (angle: ViewAngle): number => TURN[angle];

export const HEAD = {
  viewBox: { width: 200, height: 250 },
  cx: 100,
  cy: 104,
  rx: 44,
  ry: 54,
  neckTop: 148,
  neckBottom: 182,
  neckHalfWidth: 17,
} as const;

export interface HeadGeometry {
  viewBox: { width: number; height: number };
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  neckTop: number;
  neckBottom: number;
  neckHalfWidth: number;
}

/**
 * Head geometry for one camera angle. A skull is deeper front-to-back than it is
 * wide, so the profile silhouette is a little broader than the front one.
 */
export function headFor(angle: ViewAngle): HeadGeometry {
  return { ...HEAD, rx: HEAD.rx * (1 + 0.13 * TURN[angle]) };
}

/**
 * Where the outer hair arc starts and ends for each angle, in degrees on the
 * skull ellipse (0 = right temple, 90 = crown, 180 = left temple).
 */
const ARC: Record<ViewAngle, { start: number; end: number }> = {
  front: { start: 196, end: -16 },
  // Part of the way to the profile: a little more nape on the left, a little
  // more forehead on the right.
  half: { start: 201, end: 5 },
  // Facing right: from the nape, over the crown, stopping at the forehead.
  side: { start: 206, end: 26 },
  back: { start: 200, end: -20 },
};

const TAU = Math.PI * 2;
const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 100) / 100;

/** Triangle wave in [-1, 1] — used for spiky texture. */
const tri = (x: number) => {
  const t = x / TAU;
  const f = t - Math.floor(t);
  return 4 * Math.abs(f - 0.5) - 1;
};

/**
 * Applies the user's live customisation choices on top of the catalog shape so
 * the mannequin updates as they drag the sliders.
 */
export function effectiveShape(shape: HairShape, options: TryOnOptions = {}): HairShape {
  let { top, sides, back } = shape;

  if (options.length === 'short') {
    top *= 0.75;
    sides *= 0.5;
    back *= 0.35;
  } else if (options.length === 'long') {
    top = clamp01(top * 1.15 + 0.05);
    sides = clamp01(sides * 1.35 + 0.12);
    back = clamp01(back * 1.3 + 0.18);
  }

  if (options.fade && options.fade !== 'none') {
    const ceiling = options.fade === 'high' ? 0.05 : options.fade === 'mid' ? 0.12 : 0.2;
    sides = Math.min(sides, ceiling);
  }

  return { ...shape, top: clamp01(top), sides: clamp01(sides), back: clamp01(back) };
}

const onHead = (head: HeadGeometry, angleDeg: number, expand: number): [number, number] => {
  const a = rad(angleDeg);
  return [head.cx + (head.rx + expand) * Math.cos(a), head.cy - (head.ry + expand) * Math.sin(a)];
};

function textureAt(shape: HairShape, angleDeg: number, strength: number): number {
  const a = rad(angleDeg);
  switch (shape.texture) {
    case 'wavy':
      return strength * 2.2 * Math.sin(a * 5);
    case 'curly':
      return strength * (3.2 * Math.sin(a * 11) + 1.5 * Math.sin(a * 4.5));
    case 'coily':
      return strength * (4.0 * Math.sin(a * 17) + 1.9 * Math.sin(a * 7));
    case 'spiky':
      return strength * 4.4 * tri(a * 9);
    default:
      return 0;
  }
}

export interface HairPaths {
  /** Mass falling behind the head; drawn under the head so the face stays clear. */
  back?: string;
  /** Crown / top of the head. */
  cap: string;
  /** Hair hugging each side of the head down past the ear. */
  sideLeft?: string;
  sideRight?: string;
  /** Bun or knot at the crown. */
  knot?: { cx: number; cy: number; r: number };
  /** Gathered ponytail. */
  tail?: string;
  /** Subtle parting line. */
  part?: string;
}

export function buildHairPaths(shape: HairShape, angle: ViewAngle = 'front'): HairPaths {
  const head = headFor(angle);
  const { cx, cy, rx, ry } = head;
  const turn = TURN[angle];
  const paths: HairPaths = { cap: '' };

  const isCrest = shape.sides < 0.07 && shape.top > 0.72; // mohawk-like
  const isGathered = !!shape.knot || !!shape.tail; // tied back: no loose length
  const textureStrength = 0.45 + shape.top * 0.85;

  const expandTop = 3.5 + shape.top * 34;
  const expandSide = 2.5 + shape.sides * 12 + (shape.texture === 'coily' ? 3 : 0);

  // As the head turns, anything falling behind it swings behind the skull
  // rather than staying wrapped around it.
  const bx = cx - rx * 0.34 * turn;

  // ---- back mass ---------------------------------------------------------
  if (shape.back > 0.05 && !isGathered) {
    const bottomY = Math.min(244, cy + ry * 0.45 + shape.back * 122);
    const halfTop = rx + 6 + shape.back * 6;
    const halfBottom = rx + 2 + shape.back * 22;
    const waveAmp = shape.texture === 'straight' ? 2 : 6 + shape.back * 5;

    const bottomEdge: string[] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = -halfBottom + t * halfBottom * 2;
      const bulge = Math.sin(t * Math.PI) * 10;
      const wave = Math.sin(t * TAU * (shape.texture === 'coily' ? 5 : 3)) * waveAmp;
      bottomEdge.push(`L ${round(bx + x)} ${round(bottomY + bulge + wave)}`);
    }

    paths.back = [
      `M ${round(bx - rx * 0.92)} ${round(cy - ry * 0.2)}`,
      `C ${round(bx - halfTop - 4)} ${round(cy + ry * 0.35)} ${round(bx - halfBottom)} ${round(cy + ry * 0.95)} ${round(bx - halfBottom)} ${round(bottomY)}`,
      ...bottomEdge,
      `C ${round(bx + halfBottom)} ${round(cy + ry * 0.95)} ${round(bx + halfTop + 4)} ${round(cy + ry * 0.35)} ${round(bx + rx * 0.92)} ${round(cy - ry * 0.2)}`,
      `Q ${round(bx)} ${round(cy - ry * 1.5)} ${round(bx - rx * 0.92)} ${round(cy - ry * 0.2)}`,
      'Z',
    ].join(' ');
  }

  // ---- crown cap ---------------------------------------------------------
  // A crest is a narrow strip down the centre of the scalp — but only when you
  // look at it head-on. From the side it runs the length of the skull.
  const narrowCrest = isCrest && angle !== 'side';
  const { start: startAngle, end: endAngle } = narrowCrest
    ? { start: 138 + turn * 24, end: 42 - turn * 24 }
    : isCrest
      ? { start: 162, end: 18 }
      : ARC[angle];
  const steps = 96;
  const outer: string[] = [];

  // The crest's horizontal radius is pulled in hard while its height is left alone.
  const capRxScale = narrowCrest ? 0.45 + turn * 0.34 : 1;

  for (let i = 0; i <= steps; i += 1) {
    const deg = startAngle + ((endAngle - startAngle) * i) / steps;
    const lift = Math.pow(Math.abs(Math.sin(rad(deg))), 1.15);
    const base = expandSide + (expandTop - expandSide) * lift;
    const expand = base + textureAt(shape, deg, textureStrength) * (0.4 + lift);
    const a = rad(deg);
    const x = cx + (rx * capRxScale + expand * capRxScale) * Math.cos(a);
    const y = cy - (ry + expand) * Math.sin(a);
    outer.push(`${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`);
  }

  // Walk back along the skull between two angles, so no sliver of background is
  // left showing between the hair and the head.
  const hug = (from: number, to: number) => {
    const hugSteps = Math.max(8, Math.round(Math.abs(to - from) / 8));
    const points: string[] = [];
    for (let i = 1; i <= hugSteps; i += 1) {
      const [hx, hy] = onHead(head, from + ((to - from) * i) / hugSteps, 1.5);
      points.push(`L ${round(hx)} ${round(hy)}`);
    }
    return points;
  };

  if (isCrest && angle === 'side') {
    // In profile the crest is a strip sitting on the scalp, so the scalp itself
    // is its lower edge — closing it flat would leave spikes beside the head.
    paths.cap = [...outer, ...hug(endAngle, startAngle), 'Z'].join(' ');
  } else if (isCrest) {
    // Close the strip flat across the scalp.
    const scalpY = cy - ry * 0.62;
    paths.cap = [
      ...outer,
      `L ${round(cx + rx * capRxScale)} ${round(scalpY)}`,
      `L ${round(cx - rx * capRxScale)} ${round(scalpY)}`,
      'Z',
    ].join(' ');
  } else if (angle === 'back') {
    // From behind there is no face to leave clear: the hair covers the whole
    // skull and closes around the nape.
    paths.cap = [...outer, ...hug(endAngle, startAngle - 360), 'Z'].join(' ');
  } else if (angle === 'side') {
    // In profile the hair covers the near side of the head down to a hairline
    // running from the forehead past the ear to the nape — high for a fade,
    // below the jaw for long sides.
    const [fx, fy] = onHead(head, endAngle, 1.5);
    const [nx, ny] = onHead(head, startAngle, 1.5);
    const hairlineY = cy - ry * 0.62 + shape.sides * ry * 1.7;
    paths.cap = [
      ...outer,
      `L ${round(fx)} ${round(fy)}`,
      `C ${round(cx + rx * 0.52)} ${round(hairlineY)} ${round(cx - rx * 0.52)} ${round(hairlineY)} ${round(nx)} ${round(ny)}`,
      'Z',
    ].join(' ');
  } else {
    // The hairline meets the head above the widest point, otherwise every style
    // reads as a swim cap pulled down over the temples. On a turned head it is
    // no longer symmetric: it rides higher on the far side, drops past the near
    // temple, and the whole sweep foreshortens towards the face.
    const farTemple = 18 + turn * 12;
    const nearTemple = 18 - turn * 10;
    const [, rty] = onHead(head, farTemple, 1.5);
    const [ltx, lty] = onHead(head, 180 - nearTemple, 1.5);
    const targetY = cy - ry * (0.72 - shape.fringe * 0.62);
    const controlY = 2 * targetY - (rty + lty) / 2;

    paths.cap = [
      ...outer,
      ...hug(endAngle, farTemple),
      `Q ${round(cx + rx * 0.42 * turn)} ${round(controlY)} ${round(ltx)} ${round(lty)}`,
      ...hug(180 - nearTemple, startAngle),
      'Z',
    ].join(' ');
  }

  // ---- sides -------------------------------------------------------------
  // Only the views that still face you need them: the profile and back caps
  // already cover the whole visible side of the skull.
  if (angle !== 'side' && angle !== 'back' && !isCrest && shape.sides > 0.01) {
    const sweep = 22 + shape.sides * 74;
    const sideSteps = 26;

    const buildSide = (mirror: boolean, weight: number) => {
      const from = mirror ? -16 : 196;
      const direction = mirror ? -1 : 1;
      const outerPts: string[] = [];
      const innerPts: string[] = [];
      for (let i = 0; i <= sideSteps; i += 1) {
        const t = i / sideSteps;
        const deg = from + direction * sweep * weight * t;
        // Fades taper to nothing at the bottom; longer sides keep their weight.
        const taper = 1 - t * (1 - Math.min(1, shape.sides * 1.9));
        const expand =
          Math.max(0.4, expandSide * weight * taper) + textureAt(shape, deg, textureStrength * 0.5) * t;
        const [ox, oy] = onHead(head, deg, expand);
        outerPts.push(`${i === 0 ? 'M' : 'L'} ${round(ox)} ${round(oy)}`);
        const [ix, iy] = onHead(head, deg, -1);
        innerPts.unshift(`L ${round(ix)} ${round(iy)}`);
      }
      return [...outerPts, ...innerPts, 'Z'].join(' ');
    };

    // Turned away from the camera the far side foreshortens to a sliver, while
    // the near side shows the full sweep down past the ear.
    paths.sideLeft = buildSide(false, 1 + turn * 0.3);
    paths.sideRight = buildSide(true, 1 - turn * 0.7);
  }

  // ---- knot / tail -------------------------------------------------------
  if (shape.knot) {
    paths.knot = {
      cx: cx - rx * 0.22 * turn,
      cy: cy - ry - 6 - shape.top * 16,
      r: 13 + shape.top * 6,
    };
  }

  if (shape.tail) {
    // Drawn behind the head, so only the length below the jaw is visible from
    // the front — which is exactly how a gathered tail reads.
    const topY = cy - ry * 0.6;
    const bottomY = Math.min(238, cy + ry * 0.5 + shape.back * 105);
    const halfWidth = 22 + shape.back * 8;
    paths.tail = [
      `M ${round(bx - 12)} ${round(topY)}`,
      `C ${round(bx - halfWidth)} ${round(topY + 60)} ${round(bx - halfWidth)} ${round(bottomY - 40)} ${round(bx - 7)} ${round(bottomY)}`,
      `Q ${round(bx)} ${round(bottomY + 10)} ${round(bx + 7)} ${round(bottomY)}`,
      `C ${round(bx + halfWidth)} ${round(bottomY - 40)} ${round(bx + halfWidth)} ${round(topY + 60)} ${round(bx + 12)} ${round(topY)}`,
      'Z',
    ].join(' ');
  }

  // ---- parting -----------------------------------------------------------
  // A parting only reads when the scalp is facing you.
  if (angle !== 'side' && shape.part && shape.part !== 'none' && shape.top > 0.12) {
    const x = cx + (shape.part === 'middle' ? 0 : rx * 0.32) + rx * 0.22 * turn;
    const topY = cy - ry - expandTop * 0.55;
    paths.part = `M ${round(x)} ${round(topY)} L ${round(x)} ${round(cy - ry * 0.34)}`;
  }

  return paths;
}
