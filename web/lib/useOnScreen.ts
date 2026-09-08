'use client';

/**
 * Whether an element is anywhere near the viewport.
 *
 * It exists for the drifting rows — the front page's two catalogue shelves and
 * the suggestion shelf under a preview and under every cut. Those are CSS
 * animations, and a CSS animation does not stop when it is scrolled past: the
 * compositor keeps advancing a transform, and every plate riding on it keeps
 * being composited, for as long as the page is open. On the front page that is
 * around 320 plates — each one an `<img>` and, wherever the shade on screen is
 * not the shade the cut was shot in, a second layer carrying an `feColorMatrix`
 * through a mask — still being drawn while somebody reads the catalogue below
 * them.
 *
 * The same argument `<HeroCompare>` already makes for its animation frame, in
 * the one place it had not been made: spending a visitor's battery on a picture
 * nobody is looking at is not a trade, it is a leak.
 *
 * Nothing about it is visible. The rows pause where they are and resume from
 * there, which is what a marquee coming back into view looks like anyway.
 *
 * It starts **true** — on screen, moving — for the reason `useReducedMotion`
 * starts at "motion allowed": the server has no viewport, so a hook that started
 * false would hydrate every row into a paused state and start it a frame later.
 * The observer corrects it immediately for anything genuinely out of view.
 *
 * The margin is generous on purpose. A row that begins moving only once its top
 * edge crosses the fold is a row somebody watches start, which draws the eye to
 * the mechanism rather than to the haircuts.
 */

import { useEffect, useRef, useState } from 'react';

export function useOnScreen<T extends HTMLElement>(
  margin = '300px',
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const node = ref.current;
    // No element yet, or a browser without the observer: leave it moving, which
    // is exactly what it did before this hook existed.
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return [ref, onScreen];
}
