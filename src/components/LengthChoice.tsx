import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { HairLength, HairLengthId } from '@/api/types';
import { ControlHeading } from '@/components/ControlCard';
import { makeStyles, spacing, type } from '@/theme/theme';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
};

/** Thumb diameter; the track is inset by its radius so the thumb never overhangs. */
const THUMB = 22;
const R = THUMB / 2;

/**
 * How long the cut is worn, as a slider.
 *
 * A slider rather than the segmented `<ChoiceRow>` the fade and colour
 * adjustments used, and rather than the tile row `<HairTypeChoice>` uses beside
 * it, because the two controls are answering different *kinds* of question and
 * should not look alike. Hair type is a set of four unordered categories — your
 * hair is coily or it is not, and type 4 is not "more" than type 1 — so it gets
 * equal tiles. Length is one ordered quantity sampled at two or three points,
 * and a slider is the only control that says so: the stops are on a line, the
 * line runs short to long, and dragging is a continuous motion through a
 * continuous property. Presented as three buttons it would read as three
 * unrelated haircuts, which is exactly what it is not.
 *
 * It is deliberately not the generic `<Slider>` in `Controls.tsx`. That one is a
 * continuous 0-100 with a percentage readout baked into its header, and a
 * percentage is the wrong unit here — nobody wants a 67% long haircut. The stops
 * are named catalog positions, and the names have to be on the track.
 *
 * It is a *section* rather than a card: `<ControlCard>` supplies the border and
 * the padding, and shares them with the hair-type row above. See that file for
 * why the two adjustments stopped being two cards.
 *
 * Nothing here knows how many lengths exist or what any of them is called: the
 * stops are whatever `lengths` carries, names and descriptions straight from the
 * catalog, in the order given. Two stops and three stops are both normal — see
 * `HairLengthOffer` for why some cuts only travel one way.
 */
export function LengthChoice({
  lengths,
  value,
  onChange,
  note,
}: {
  /** The positions this cut is offered at, short to long. At least two. */
  lengths: HairLength[];
  value: HairLengthId;
  onChange: (id: HairLengthId) => void;
  /**
   * One line under the track for whatever is true of *this* cut — today, that
   * the cut has not been rendered at the length being asked for. Left off when
   * there is nothing to say, and then the control carries no line at all: the
   * stop's name is in the heading and its description is a sentence nobody
   * needed to read to work out that "Long" is longer.
   */
  note?: string | null;
}) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const stops = lengths.length;

  const index = Math.max(
    0,
    lengths.findIndex((entry) => entry.id === value),
  );
  const indexRef = useRef(index);
  indexRef.current = index;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  }, []);

  /**
   * Snap to the nearest stop and report only when it actually changes, so a
   * drag across one stop is one haptic and one state change rather than one per
   * frame. `onChange` is not called for a no-op move: the style screen stops its
   * variant cycle on the first change, and a slider that fired on every touch
   * would stop it on a tap that chose nothing.
   */
  const commit = useCallback(
    (x: number) => {
      const usable = widthRef.current - THUMB;
      if (usable <= 0) return;
      const ratio = Math.max(0, Math.min(1, (x - R) / usable));
      const next = Math.round(ratio * (stops - 1));
      if (next === indexRef.current) return;
      indexRef.current = next;
      tap();
      onChange(lengths[next].id);
    },
    [lengths, stops, onChange],
  );

  // `locationX` is only reliable on the initial touch, so the drag is tracked as
  // an offset from where the finger landed — the same approach as `<Slider>`.
  const grantX = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          grantX.current = event.nativeEvent.locationX;
          commit(grantX.current);
        },
        onPanResponderMove: (_event, gesture) => commit(grantX.current + gesture.dx),
      }),
    [commit],
  );

  const usable = Math.max(0, width - THUMB);
  /** Centre of stop `i` in track coordinates. */
  const centre = (i: number) => R + (stops > 1 ? (i / (stops - 1)) * usable : 0);
  const selected = lengths[index];

  const step = (delta: number) => {
    const next = Math.max(0, Math.min(stops - 1, index + delta));
    if (next === index) return;
    indexRef.current = next;
    tap();
    onChange(lengths[next].id);
  };

  return (
    <View>
      {/* The hint states the answer rather than the verb.
          A line under the track carried the selected stop's own description
          from the catalog on every render, and a second line carried the note
          when there was one — so the control's quietest fact and its most
          urgent one were the same shape, and the description was costing the
          fold a row it spent on saying "worn short" under a slider whose label
          already said "Short". The stop's *name* rides the heading, where every
          other control on this page puts its state, and the line below is left
          for the thing that is only sometimes true. */}
      <ControlHeading title="Hair length" hint={selected.name} />

      <View
        style={styles.track}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Hair length"
        accessibilityValue={{ text: selected.name }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          step(event.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        {...responder.panHandlers}
      >
        <View style={styles.rail} />
        <View style={[styles.railFill, { left: R, width: Math.max(0, centre(index) - R) }]} />

        {/* A tick per stop, so the track shows how many positions this cut has
            before it is touched. A two-stop cut has to look like a two-stop cut. */}
        {lengths.map((entry, i) => (
          <View
            key={entry.id}
            style={[
              styles.tick,
              { left: centre(i) - 3 },
              i <= index && styles.tickOn,
              i === index && styles.tickHidden,
            ]}
          />
        ))}

        <View style={[styles.thumb, { left: centre(index) - R }]} />
      </View>

      {/* Labels are positioned on their stop rather than laid out in a row: an
          evenly spaced row does not line up with a track that is inset by the
          thumb radius, and a label that sits a few points off its tick reads as
          sloppy at two stops and as wrong at three. Each is pressable, so the
          slider can be used without dragging. */}
      <View style={[styles.labels, { height: 16 }]}>
        {lengths.map((entry, i) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={entry.name}
            accessibilityState={{ selected: i === index }}
            onPress={() => {
              if (i === index) return;
              indexRef.current = i;
              tap();
              onChange(entry.id);
            }}
            style={[styles.label, { left: centre(i) - 40 }]}
          >
            <Text
              style={[styles.labelText, i === index && styles.labelTextOn]}
              numberOfLines={1}
            >
              {entry.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {note ? <Text style={[type.caption, styles.note]}>{note}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  track: {
    height: THUMB + spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'center',
  },
  rail: {
    position: 'absolute',
    left: R,
    right: R,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSunken,
  },
  railFill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  tick: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairlineStrong,
  },
  tickOn: { backgroundColor: colors.accentSoft },
  /** The stop under the thumb is covered by it; drawing both shows through. */
  tickHidden: { opacity: 0 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: R,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  labels: { marginTop: 2 },
  label: { position: 'absolute', width: 80, alignItems: 'center' },
  labelText: { ...type.label, fontSize: 12, lineHeight: 16, letterSpacing: 0, color: colors.muted },
  labelTextOn: { color: colors.accentInk },
  note: { color: colors.muted, marginTop: spacing.sm },
}));
