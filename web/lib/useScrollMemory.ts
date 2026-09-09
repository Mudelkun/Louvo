'use client';

/**
 * Where the catalogue was left, so coming back is not scrolling down again.
 *
 * The catalogue is a long grid and the assumption behind browsing it is that
 * the right haircut has *not* been found yet: somebody scrolls, opens a cut,
 * decides against it, and comes back to carry on from there. The back arrow on
 * the style page is a `<Link href="/styles">` rather than the browser's own
 * Back — deliberately, because a search result and a shared link both land on
 * that page with nothing behind them — and a link is a forward navigation, so
 * the router puts the window at the top of the catalogue every time. Forty
 * cards down, that is the whole browse thrown away on the one gesture that
 * means "not this one, show me the others".
 *
 * So the position is remembered here instead. Four things about it are
 * deliberate.
 *
 * **It is `sessionStorage`, and that is the right lifetime.** A remembered
 * scroll offset is a fact about one visit in one tab, not about this browser
 * for ever: a new tab is a new browse and deserves the top of the catalogue.
 * It is also the one storage this file could fail to reach — a private window,
 * a browser with site data off — so every read and write is wrapped and losing
 * the position is the entire cost of failing.
 *
 * **A position is only restored against the grid it was taken on.** The offset
 * is stored with a signature of what the grid was showing — the answers, the
 * category, the sort, the search and how many cuts survived them. Change a
 * filter and 2,400px is not a scroll position any more, it is an arbitrary
 * point in a different list, so a mismatch is discarded rather than applied.
 *
 * **It waits for the page to be tall enough, and keeps waiting.** Restoring on
 * mount would scroll a document that is still eight skeleton cards tall, which
 * the browser clamps to its bottom — so the loop re-applies the target every
 * frame while the grid fills in and the plates load, up to `SETTLE_MS`. That
 * also settles the race with the router's own scroll-to-top, which happens on
 * arrival and would otherwise undo this a frame later.
 *
 * **Any real input wins immediately.** A visitor who starts scrolling during
 * that window is answering the question the loop was asking, so the loop stops
 * dead rather than dragging the page back under their finger — the same rule
 * the drifting rails follow about a pointer.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

const PREFIX = 'luvo.scroll.v1:';

/** How long to keep re-applying the target while the grid fills in. */
const SETTLE_MS = 1200;

type Remembered = { y: number; signature: string };

function read(key: string): Remembered | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Remembered> | null;
    return typeof value?.y === 'number' && typeof value?.signature === 'string'
      ? { y: value.y, signature: value.signature }
      : null;
  } catch {
    return null;
  }
}

function write(key: string, value: Remembered) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // A private window, a quota, storage switched off. The position is the
    // whole of what is lost, so there is nothing to report and nothing to do.
  }
}

/**
 * @param key       What is being remembered. One surface, one key.
 * @param signature What the page was showing when the position was taken. A
 *                  position is not restored against a different one.
 * @param ready     Whether the content the offset is measured against exists.
 *                  False while the catalogue is still in flight — recording
 *                  then would write a 0 over a good position, and restoring
 *                  then would aim at a page of skeletons.
 */
export function useScrollMemory(key: string, signature: string, ready: boolean) {
  /** The record as it was on arrival, read before this page can overwrite it. */
  const arrival = useRef<Remembered | null>(null);
  const restored = useRef(false);
  const latest = useRef(signature);
  latest.current = signature;

  // First, and before the recorder below can run: a layout effect on mount, so
  // the value being restored is the one the previous visit left rather than
  // whatever this page's own arrival scroll has already written over it.
  useLayoutEffect(() => {
    arrival.current = read(key);
  }, [key]);

  // Put the window back.
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;

    const target = arrival.current;
    if (!target || target.y < 1 || target.signature !== signature) return;

    let frame = 0;
    let live = true;
    const deadline = performance.now() + SETTLE_MS;

    // Anything the visitor does themselves ends it — see the header.
    const stop = () => {
      live = false;
      if (frame) cancelAnimationFrame(frame);
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const event of events) window.addEventListener(event, stop, { passive: true });

    const attempt = () => {
      if (!live) return;
      const room = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const top = Math.min(target.y, room);
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo(0, top);
      if (performance.now() < deadline) frame = requestAnimationFrame(attempt);
    };
    frame = requestAnimationFrame(attempt);

    return () => {
      stop();
      for (const event of events) window.removeEventListener(event, stop);
    };
  }, [ready, signature]);

  // Record, from the moment there is a real page to have a position in. One
  // write per frame at most: a scroll fires far faster than storage wants to be
  // written, and the only value that matters is the last one.
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write(key, { y: window.scrollY, signature: latest.current });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ready, key]);
}
