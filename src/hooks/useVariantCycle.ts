import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

import { NATIVE_DRIVER } from '@/lib/motion';
import type { VariantId } from '@/api/types';

/**
 * How long one render is held before the next fades in, and how long the fade
 * itself takes.
 *
 * Both are deliberately slower than they first were (1900/560), which changed
 * too abruptly: a grid is looked *past* rather than at, so a change quick enough
 * to catch the eye is read as something twitching. The dissolve wants to be
 * noticed after it has finished, not while it is happening — the card should
 * seem to have been showing this render all along. That means a fade long
 * enough that no single frame of it is a jump, and a hold long enough that the
 * card is plainly still between two of them.
 *
 * Slower has one real cost: three renders now take about thirteen seconds to
 * come round, so a user who scrolls past quickly may only ever see two of them.
 * That is the right trade — the point is that the cut *has* other versions, and
 * two says that as well as three does.
 */
export const CYCLE_HOLD_MS = 3400;
export const CYCLE_FADE_MS = 1200;

export interface VariantCycle {
  /** The render on top — what the card is showing, or moving to during a fade. */
  current: VariantId | null;
  /** The render underneath during a fade, and null while nothing is moving. */
  previous: VariantId | null;
  /** 0 the instant `current` becomes the new one, 1 once it has fully arrived. */
  fade: Animated.Value;
  /** Whether this card is actually cycling — false for a cut with one render. */
  cycling: boolean;
}

/**
 * The beat every cycling card changes on — one clock and one fade for the whole
 * grid, rather than a timer per card.
 *
 * The cards were staggered at first, on the theory that a grid changing all at
 * once reads as a glitch. Watched, it does not: it reads as the catalog turning
 * a page, and the simultaneity is what makes it legible as *one* thing the app
 * is doing rather than several cards each doing their own. So this is shared,
 * and it has to be shared at the module rather than merely set to the same
 * delay: cards mount as they are scrolled into view, so per-card timers with a
 * zero stagger would still each start from their own mount and drift apart.
 *
 * Only *when* is shared. Which render a card is on is the card's own — it starts
 * at the first of its own list and advances a step on each beat — so a card
 * scrolled into view halfway through the grid's loop still opens on the render
 * it would have opened on, and a cut with two renders and one with three stay in
 * step without either being made to skip.
 *
 * The clock runs only while something is subscribed to it, so a screen with no
 * cycling cards on it (any grid filtered to a hair type, the whole app under
 * reduced motion) has no timer running at all.
 */
const beat = new Animated.Value(1);
const listeners = new Set<{ advance: () => void; settle: () => void }>();
let timer: ReturnType<typeof setTimeout> | null = null;
let animation: Animated.CompositeAnimation | null = null;

function tick() {
  for (const listener of [...listeners]) listener.advance();
  beat.setValue(0);
  animation = Animated.timing(beat, {
    toValue: 1,
    duration: CYCLE_FADE_MS,
    // The gentlest S-curve there is: it leaves and arrives almost stopped, so
    // neither end of the dissolve has an edge on it. A quad in-out still had a
    // discernible start, which is most of what "sudden" was.
    easing: Easing.inOut(Easing.sin),
    useNativeDriver: NATIVE_DRIVER,
  });
  // Once the fade has landed the outgoing render is invisible under an opaque
  // one, so every card drops it rather than leaving it mounted: a card that had
  // cycled once would otherwise carry two mannequins — two filtered SVGs — for
  // the rest of its life on screen, times every card in the grid. Only on
  // `finished`; a fade cut short has not covered anything.
  animation.start(({ finished }) => {
    if (finished) for (const listener of [...listeners]) listener.settle();
  });
  timer = setTimeout(tick, CYCLE_HOLD_MS + CYCLE_FADE_MS);
}

function subscribe(listener: { advance: () => void; settle: () => void }) {
  listeners.add(listener);
  if (listeners.size === 1 && !timer) timer = setTimeout(tick, CYCLE_HOLD_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    if (timer) clearTimeout(timer);
    timer = null;
    animation?.stop();
    animation = null;
    beat.setValue(1);
  };
}

/**
 * Whether the platform has been asked to keep motion down.
 *
 * This is the one animation in the app that nobody started and nothing stops:
 * every card in the grid moving on its own, indefinitely. That is exactly the
 * kind the setting exists for, so under it the cycle resolves to its first
 * render and simply stays there — the same image the grid showed before any of
 * this, rather than a degraded version of it.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/**
 * Walks a style's renders, one at a time, cross-fading between them.
 *
 * This is what "All Types" looks like on a card. With no hair type declared
 * there is no single right render to show — `variantCandidates()` returns the
 * whole set and the grid used to pick the first of them and stop — so the card
 * shows them in turn instead, and the fact that a cut comes in several textures
 * is visible without opening it.
 *
 * The list handed in must be renders that actually exist and actually differ
 * (`renderedVariants()`); this hook decides only *when*, never *what*. Fewer
 * than two, or reduced motion, and it settles on the first entry and never
 * subscribes to anything — a card with one render is a still card, not a card
 * animating between two copies of the same picture.
 */
export function useVariantCycle(variants: VariantId[], options?: { enabled?: boolean }): VariantCycle {
  const reduced = useReducedMotion();
  const count = variants.length;
  const cycling = options?.enabled !== false && count > 1 && !reduced;

  const [shown, setShown] = useState<{ current: number; previous: number | null }>({
    current: 0,
    previous: null,
  });

  // The variant ids themselves are the dependency, not the array: it is rebuilt
  // on every render, and a fresh identity each time would resubscribe on every
  // keystroke in the search field.
  const key = variants.join(',');

  useEffect(() => {
    // A changed list — another gender's catalog, a different card in this slot —
    // starts again from the top rather than resuming at an index that now means
    // a different render.
    setShown((was) => (was.current === 0 && was.previous === null ? was : { current: 0, previous: null }));
    if (!cycling) return;

    return subscribe({
      advance: () => setShown((was) => ({ current: (was.current + 1) % count, previous: was.current })),
      settle: () =>
        setShown((was) => (was.previous == null ? was : { current: was.current, previous: null })),
    });
  }, [key, count, cycling]);

  // Modulo rather than a bare index: the state above is reset by an effect, so
  // the render between a shrinking list and that effect would otherwise reach
  // past the end of it.
  const current = count ? variants[shown.current % count] : null;
  const previous =
    count && shown.previous != null && shown.previous % count !== shown.current % count
      ? variants[shown.previous % count]
      : null;

  return { current: current ?? null, previous: previous ?? null, fade: beat, cycling };
}
