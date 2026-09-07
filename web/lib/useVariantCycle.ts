'use client';

/**
 * One clock, for every card on the page.
 *
 * Under *All Types* a card does not pick one of a cut's renders and stop — it
 * shows them all, in turn. Taking the first and stopping made a cut generated in
 * three textures look exactly like a cut generated in one, and the only way to
 * find out otherwise was to open it.
 *
 * ## Why the beat is shared rather than per card
 *
 * Because cards mount as they scroll into view, so equal delays measured from
 * each card's own mount fan apart within a screenful. A grid that drifts reads
 * as noise; a grid that moves together reads as the catalog turning a page, and
 * the simultaneity is what makes it one thing the site is doing rather than
 * forty cards each doing their own.
 *
 * **Only *when* is shared.** Each card advances one step through *its own* list,
 * so a card scrolled into view mid-loop still opens on the render it would have
 * opened on, and a two-render cut stays in step with a three-render one without
 * either skipping.
 *
 * The clock runs only while something is subscribed, and it resolves to a still
 * first frame under reduced motion — it is the one animation here that nobody
 * started and nothing stops.
 */

import { useEffect, useState } from 'react';

import { prefersReducedMotion } from './useReducedMotion';

/**
 * Slower than the app's, deliberately.
 *
 * A phone shows six cards; a laptop shows twenty-four. The same cadence across
 * that many plates at once stops reading as a page turning and starts reading as
 * a screensaver.
 */
const BEAT_MS = 4200;

let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(value: number) => void>();

function subscribe(listener: (value: number) => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      tick += 1;
      for (const entry of listeners) entry(tick);
    }, BEAT_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      // Reset so the next grid to mount opens on everybody's first render
      // rather than wherever the last one happened to leave off.
      tick = 0;
    }
  };
}

/**
 * The index into `length` this card should currently be showing.
 *
 * Returns 0 and subscribes to nothing when there is nothing to cycle — a
 * single-render style, a declared hair type, or a visitor who has asked for
 * reduced motion.
 */
export function useVariantCycle(length: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length < 2 || prefersReducedMotion()) {
      setIndex(0);
      return;
    }
    return subscribe((value) => setIndex(value % length));
  }, [length]);

  // A list that shrank under a running clock — a filter change, a variant that
  // failed to load — must not index past its end for one frame.
  return length > 0 ? index % length : 0;
}
