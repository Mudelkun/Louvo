'use client';

/**
 * "Has this visitor asked for less motion", in the two shapes the site needs.
 *
 * A mirror of the app's `useReducedMotion`, and shared here for the same reason:
 * three separate answers to one system preference is three places for one of
 * them to be forgotten. `prefersReducedMotion()` is the one-shot read, for code
 * that is already inside an effect and only needs to know whether to start a
 * clock; the hook is for code that has to *render* differently, which cannot ask
 * during the server render and must not assume either answer for the first
 * frame.
 *
 * It starts at `false` — motion allowed — and corrects itself on mount. That is
 * the right way round: the server has no media queries, so a hook that started
 * at `true` would hydrate every page into its still state and then start
 * everything moving a frame later, which is a worse first impression for
 * everybody and a jolt for exactly the people the setting is for.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(QUERY);
    setReduced(media.matches);

    // Followed rather than read once: the setting is a system toggle, and on a
    // laptop it is flipped without the page being reloaded.
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
