import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { NATIVE_DRIVER } from '@/lib/motion';
import { useSmoothProgress } from '@/components/ProgressRing';
import { colors, radii, spacing, type } from '@/theme/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * The waiting screen's parts.
 *
 * All of this exists to answer the one question the old processing tile could
 * not: *is this still working, and how much longer*. A percentage answers
 * neither — it is a number that stops moving. So the wait is built from four
 * things that each move for a different reason, and none of them invents
 * progress the generator did not report:
 *
 * - the frame closing around the user's own photo — real progress, eased;
 * - a pair of scissors working across that photo — liveness, on its own loop;
 * - a word under it, cycling within the stage the generator reported;
 * - a countdown that only ever counts down — see `useEta`.
 *
 * The photo is the stage rather than a spinner in the middle of an empty screen
 * because the thing being waited for is a picture of the user, and having it in
 * front of them is the difference between waiting for a task and waiting for a
 * result.
 */

// ---------------------------------------------------------------------------
// How much longer
// ---------------------------------------------------------------------------

/**
 * "About 9s left", and it never goes up.
 *
 * The naive estimate — elapsed x (1 - p) / p, recomputed every tick — climbs
 * whenever progress holds still, which is most of a stage: the user watches the
 * remaining time grow while they wait, which is worse than showing nothing. So
 * each report proposes a *deadline* and the deadline may only move earlier. A
 * stage change, the one moment the generator really knows something, is what
 * pulls it in.
 *
 * Running past the deadline is not an error and is not reset — it becomes
 * "Almost there", which is both true and the right last thing on screen before
 * a result appears.
 */
export function useEta(progress: number, startedAt: number): string {
  const deadline = useRef<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (progress <= 0.02) return;
    const elapsed = Date.now() - startedAt;
    // Capped: an early, slow first stage can project minutes, and a number that
    // large reads as a failure rather than as an estimate.
    const remaining = Math.min((elapsed * (1 - progress)) / progress, 90_000);
    const candidate = Date.now() + remaining;
    deadline.current = deadline.current === null ? candidate : Math.min(deadline.current, candidate);
  }, [progress, startedAt]);

  if (deadline.current === null) return 'Estimating…';
  const seconds = Math.ceil((deadline.current - Date.now()) / 1000);
  return seconds <= 1 ? 'Almost there' : `About ${seconds}s left`;
}

// ---------------------------------------------------------------------------
// The scissors
// ---------------------------------------------------------------------------

/**
 * One half of the scissors, drawn pointing right with the pivot at the origin:
 * a tapered blade whose cutting edge runs along the axis, the shank behind it,
 * and the finger ring.
 *
 * Only one half is drawn. The other is this one mirrored in y, so the two
 * blades cannot drift out of agreement about where the pivot is.
 */
const BLADE = 'M 1 -0.5 L 3.5 -5 L 27 -3 L 33.5 -0.5 Z';
const SHANK = 'M 0.5 -0.5 L -10 -5';
const RING = { cx: -15, cy: -7.5, r: 5.2 };

/** How far each blade swings off the axis, closed and open. */
const BLADE_CLOSED = 2;
const BLADE_OPEN = 15;

/**
 * A snipping pair of scissors.
 *
 * The two blades are separate `Animated.View`s rather than an animated SVG
 * `transform` string, because a transform string has to be re-rendered every
 * frame while a view transform runs on the native driver. Each blade's viewBox
 * is centred on the pivot, so rotating the view about its own centre rotates
 * the blade about the pivot — which is the whole trick that makes this read as
 * scissors rather than as a wobbling icon.
 *
 * The rhythm is deliberately not even: the close is fast and the open is slow,
 * with a beat before the next snip, because a symmetrical open/close reads as a
 * mechanism idling and this should read as somebody working.
 */
export function Scissors({ size = 58 }: { size?: number }) {
  const snip = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(snip, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.delay(90),
        Animated.timing(snip, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
        Animated.delay(150),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [snip]);

  /**
   * One half, optionally mirrored in y about the pivot. `scale(1,-1)` is
   * applied inside the SVG and the rotation outside it, so the lower blade is
   * the upper one reflected and then swung the opposite way.
   */
  const half = (mirrored: boolean) => (
    <Svg width={size} height={size} viewBox="-36 -36 72 72">
      <G transform={mirrored ? 'scale(1,-1)' : undefined}>
        <Path d={BLADE} fill={colors.onDark} stroke="rgba(24,21,19,0.3)" strokeWidth={0.9} strokeLinejoin="round" />
        <Path d={SHANK} stroke={colors.onDark} strokeWidth={3} strokeLinecap="round" fill="none" />
        <Circle cx={RING.cx} cy={RING.cy} r={RING.r} stroke={colors.onDark} strokeWidth={2.8} fill="none" />
      </G>
    </Svg>
  );

  const angle = (from: number, to: number) =>
    snip.interpolate({ inputRange: [0, 1], outputRange: [`${from}deg`, `${to}deg`] });

  return (
    <View style={{ width: size, height: size, pointerEvents: 'none' }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: angle(-BLADE_CLOSED, -BLADE_OPEN) }] }]}
      >
        {half(false)}
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: angle(BLADE_CLOSED, BLADE_OPEN) }] }]}
      >
        {half(true)}
      </Animated.View>
      {/* The screw. Outside both rotating layers because the one point on a
          pair of scissors that does not move is the one they turn about. */}
      <Svg width={size} height={size} viewBox="-36 -36 72 72" style={StyleSheet.absoluteFill}>
        <Circle cx={0} cy={0} r={2.4} fill={colors.accent} />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The photo, being worked on
// ---------------------------------------------------------------------------

/**
 * The user's photo with the scissors working across it, framed by the progress
 * itself.
 *
 * The frame is a rounded-rect stroke rather than a donut off to one side: the
 * loop closes *around their face*, so the thing filling up and the thing being
 * waited for are one object.
 *
 * The cut is one motion made of two: a band travels down the photo, and the
 * scissors travel across its bright leading edge on a different period, so the
 * pair trace a path that never quite repeats. Both run on their own timers and
 * say only "still working" — deliberately not tied to progress, because
 * scissors that slowed down when the queue did would read as the app
 * struggling rather than as the queue being busy.
 */
export function ScanningPhoto({
  width,
  height,
  progress,
  children,
}: {
  width: number;
  height: number;
  /** 0..1 */
  progress: number;
  /** The photo (or the mannequin standing in for it) being worked on. */
  children: React.ReactNode;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const inset = 3;
  const radius = radii.xl;
  const w = width - inset * 2;
  const h = height - inset * 2;
  // Rounded-rect perimeter: the four straights, plus one whole circle of corner.
  const perimeter = 2 * (w - 2 * radius) + 2 * (h - 2 * radius) + 2 * Math.PI * radius;

  const { value } = useSmoothProgress(progress);
  const dashOffset = useMemo(
    () => value.interpolate({ inputRange: [0, 1], outputRange: [perimeter, 0] }),
    [value, perimeter],
  );

  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  /**
   * The scissors' traverse: one way, left to right, fading in and out at the
   * edges. A back-and-forth would need the blades to turn around at each end —
   * flipping them mid-travel means scaling x through zero, which is a frame of
   * nothing — and scissors that reverse without turning read as a sprite on a
   * track. Going off one side and returning from the other reads as a barber
   * moving round the head.
   */
  const traverse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(traverse, {
        toValue: 1,
        duration: 2900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [traverse]);

  const bandHeight = Math.round(height * 0.34);
  const scissorSize = Math.round(Math.min(width, height) * 0.2);
  const clarity = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width, height }}>
      <View style={[styles.stageClip, { width, height, borderRadius: radius }]}>
        {children}

        {/* The photo clears as the work lands: driven by real progress, so it is
            a reading of the job rather than an animation playing over one. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.ink, opacity: 0.04 + 0.3 * (1 - clarity), pointerEvents: 'none' },
          ]}
        />

        <Animated.View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            left: 0,
            right: 0,
            height: bandHeight,
            transform: [
              {
                translateY: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-bandHeight, height],
                }),
              },
            ],
          }}
        >
          <LinearGradient colors={SCAN_GRADIENT} style={StyleSheet.absoluteFill} />
          <View style={styles.scanLine} />

          {/* Centred on the band's bright edge, so the blades close on the line
              they are cutting along rather than beside it. */}
          <Animated.View
            style={{
              position: 'absolute',
              bottom: -scissorSize / 2,
              left: 0,
              opacity: traverse.interpolate({
                inputRange: [0, 0.1, 0.88, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: traverse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-scissorSize * 0.35, width - scissorSize * 0.6],
                  }),
                },
              ],
            }}
          >
            <Scissors size={scissorSize} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* The frame is drawn over the clip, or the stroke is cut in half by it. */}
      <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Defs>
          <SvgGradient id={`frame${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} />
            <Stop offset="1" stopColor={colors.accentGlow} />
          </SvgGradient>
        </Defs>
        <Rect
          x={inset}
          y={inset}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={3}
        />
        <AnimatedRect
          x={inset}
          y={inset}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={`url(#frame${uid})`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${perimeter} ${perimeter}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
    </View>
  );
}

/** Transparent into accent into a bright leading edge — the trail behind the cut line. */
const SCAN_GRADIENT = ['rgba(154,107,36,0)', 'rgba(154,107,36,0.24)', 'rgba(255,255,255,0.55)'] as const;

// ---------------------------------------------------------------------------
// What is happening
// ---------------------------------------------------------------------------

/**
 * The words, one pool per entry in `GENERATION_STEPS` and in the same order.
 *
 * This is the part that could easily have become a lie. A single list cycled on
 * a timer would be a fake checklist with better pacing — it would say
 * "Tapering" while the request was still queued. Gating each pool on the job's
 * real `stepIndex` keeps every word true at the moment it is shown: the words
 * inside a pool are all fair descriptions of that one stage, so which of them
 * is on screen is a matter of pacing rather than of claim.
 *
 * They are barber's words rather than a machine's on purpose. "Applying the
 * hairstyle" is what the software is doing; "Tapering" is what the user asked
 * for, and the wait is easier to sit through when it is narrated in the
 * language of the thing being made.
 *
 * Keep every pool long enough to outlast its stage — `apply` is most of the
 * round trip — because a pool that runs out visibly loops, and a loop is the
 * one thing that gives away a timer.
 */
export const STAGE_WORDS: string[][] = [
  ['Analysing your photo', 'Finding the hairline', 'Reading the light', 'Mapping the head', 'Measuring the crown', 'Checking the angle'],
  [
    'Sectioning',
    'Combing out',
    'Snipping',
    'Shaping',
    'Clipping',
    'Tapering',
    'Blending',
    'Texturising',
    'Layering',
    'Cutting in',
    'Thinning out',
    'Sculpting',
    'Shaping the fringe',
    'Cleaning the neckline',
    'Detailing',
  ],
  ['Dusting off', 'Combing through', 'Styling', 'Checking the mirror', 'Finishing'],
];

/**
 * One word at a time, swapped on a beat.
 *
 * Fast enough that the screen is never still — the words are the liveness cue
 * that used to be a pulsing bullet — and slow enough to read. It restarts at
 * the top of the pool when the stage changes, so a stage change is visible as
 * the language changing rather than only as a bar moving.
 */
export function WordTicker({
  words,
  intervalMs = 1150,
  style,
}: {
  words: string[];
  intervalMs?: number;
  style?: React.ComponentProps<typeof Animated.Text>['style'];
}) {
  const [index, setIndex] = useState(0);
  const enter = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setIndex(0);
  }, [words]);

  useEffect(() => {
    if (words.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(enter, { toValue: 0, duration: 160, useNativeDriver: NATIVE_DRIVER }).start(() => {
        setIndex((n) => (n + 1) % words.length);
        Animated.timing(enter, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }).start();
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words, enter, intervalMs]);

  if (!words.length) return null;

  return (
    <Animated.Text
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      style={[
        type.bodyStrong,
        styles.word,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }],
        },
        style,
      ]}
    >
      {words[index % words.length]}…
    </Animated.Text>
  );
}

/**
 * One line about the cut being generated, swapped every few seconds.
 *
 * Something to read is what turns dead time into a pause, and the lines are
 * about *this* haircut — upkeep, who it suits — so reading them is still
 * choosing a haircut rather than being entertained until the spinner finishes.
 */
export function FactTicker({ facts, intervalMs = 4200 }: { facts: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (facts.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: NATIVE_DRIVER }).start(() => {
        setIndex((n) => (n + 1) % facts.length);
        Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: NATIVE_DRIVER }).start();
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [facts.length, fade, intervalMs]);

  if (!facts.length) return null;

  return (
    <View style={styles.ticker}>
      <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
      <Animated.Text style={[type.caption, styles.tickerText, { opacity: fade }]} numberOfLines={2}>
        {facts[index % facts.length]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stageClip: { overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  word: { color: colors.ink },
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  tickerText: { color: colors.accentInk, flex: 1, fontWeight: '600' },
});
