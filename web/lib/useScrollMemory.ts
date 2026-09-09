'use client';

/**
 * Where the catalogue was left, so coming back is continuing rather than
 * arriving.
 *
 * The assumption behind browsing a long grid is that the right haircut has
 * *not* been found yet: somebody scrolls, opens a cut, decides against it, and
 * comes back to carry on from there. The style page's back arrow is a
 * `<Link href="/styles">` rather than the browser's own Back — deliberately,
 * because a search result and a shared link both land on that page with nothing
 * behind them — and a link is a forward navigation, so the router put the
 * window at the top of the catalogue every time. Forty cards down, that is the
 * whole browse thrown away on the one gesture that means "not this one".
 *
 * Four things decide any change to this.
 *
 * **It is invisible, and that is the requirement rather than a nicety.** The
 * window is put back in a *layout* effect, before the browser paints, and with
 * `scroll-behavior` forced to `auto` for the one statement that moves it — the
 * document is `smooth`, so a plain `scrollTo` would animate down the page and
 * show the visitor a journey they had already made. Nothing about coming back
 * should be watchable: the catalogue is simply where it was.
 *
 * **It only fires when somebody asked to come back.** `resumeScroll()` is
 * called by the control that means "back to the grid", and the flag it leaves
 * is consumed by the next mount. Restoring on *every* arrival would put a
 * visitor who deliberately opened the catalogue from the menu into the middle
 * of a browse they had finished with. Coming back and going there are two
 * different intentions and only one of them is this.
 *
 * **A position is only restored against the grid it was taken on.** The offset
 * is stored with a signature of what the grid was showing — the answers, the
 * category, the sort, the search and how many cuts survived them. Change a
 * filter and 2,400px is not a scroll position any more, it is an arbitrary
 * point in a different list, so a mismatch is dropped and the catalogue opens
 * at the top.
 *
 * **The position is taken when the visitor leaves, never while they scroll.**
 * That is a fix rather than an optimisation, and the bug it closes made the
 * whole thing a no-op. Pressing a card is a forward navigation, so the router
 * scrolls the catalogue to the top on its way out — and a `scroll` listener is
 * still attached while it does, because React tears a deleted tree's passive
 * effects down *after* the commit that scrolls. So the last thing recorded on
 * every departure was the router's own 0, the restore then worked perfectly,
 * and it put the visitor back exactly where the catalogue had just been
 * scrolled to. A capturing `click` is the honest moment instead: the window is
 * still where the visitor left it, nothing has navigated yet, and it costs one
 * write per press rather than one per frame of scrolling.
 *
 * **`sessionStorage`, which is the right lifetime.** A remembered offset is a
 * fact about one visit in one tab; a new tab is a new browse and deserves the
 * top of the catalogue. It is also the one storage this file can fail to reach
 * — a private window, site data switched off — so every read and write is
 * wrapped, and losing the position is the whole cost of failing.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

const PREFIX = 'luvo.scroll.v1:';
const RESUME = 'luvo.scroll.resume';

/**
 * How long to keep waiting for a document tall enough to hold the offset.
 *
 * Normally zero frames: the grid's cards are fixed-aspect boxes, so the page is
 * its full height the moment the catalogue renders and the restore lands in the
 * first layout effect. This is the cold path — a hard load, where the catalogue
 * is still in flight and the page is eight skeletons tall.
 */
const SETTLE_MS = 800;

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
 * "Take me back to where I was in `key`."
 *
 * Called by the control that means it — the style page's two ways back to the
 * catalogue — rather than inferred from a referrer or from history length,
 * neither of which can tell going back from going there.
 */
export function resumeScroll(key: string): void {
  try {
    window.sessionStorage.setItem(RESUME, key);
  } catch {
    // Same as `write`: the position is the only casualty.
  }
}

/** Reads the flag and clears it, so one press restores exactly one arrival. */
function claimResume(key: string): boolean {
  try {
    const claimed = window.sessionStorage.getItem(RESUME) === key;
    if (claimed) window.sessionStorage.removeItem(RESUME);
    return claimed;
  } catch {
    return false;
  }
}

/**
 * Moves the window with the document's own smooth scrolling switched off.
 *
 * `globals.css` sets `scroll-behavior: smooth` so in-page anchors glide, and a
 * restore that inherited it would animate the visitor back down a page they had
 * already read. The same trick the router uses for its own scroll-to-top: force
 * `auto`, move, put the rule back.
 */
function jump(top: number): void {
  const html = document.documentElement;
  const existing = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, top);
  html.style.scrollBehavior = existing;
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
  /** Whether this arrival was asked for by a way back, and is still unanswered. */
  const owed = useRef(false);
  const target = useRef<Remembered | null>(null);
  const claimed = useRef(false);
  const latest = useRef(signature);
  latest.current = signature;

  // Claimed on mount, before the recorder below can overwrite the record and
  // before anything is painted. A layout effect so a synchronous restore in the
  // effect underneath it has something to restore.
  useLayoutEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    owed.current = claimResume(key);
    target.current = owed.current ? read(key) : null;
  }, [key]);

  // Put the window back, before the paint.
  useLayoutEffect(() => {
    if (!owed.current || !ready) return;

    /**
     * Every claimed arrival is answered, including with a zero.
     *
     * The ways back carry `scroll={false}`, so the router does not touch the
     * window on this navigation — which is what lets the restore be invisible
     * and is also why doing nothing here is not an option: the page would open
     * holding whatever offset the *style page* was at. A remembered position or
     * the top, but never an inherited one.
     */
    owed.current = false;
    const goal = target.current;
    if (!goal || goal.signature !== signature) {
      jump(0);
      return;
    }

    const room = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (room() >= goal.y) {
      jump(goal.y);
      return;
    }

    // The cold path only — see `SETTLE_MS`. Still instant when it lands; what
    // is being waited for is a document tall enough to hold the offset.
    let frame = 0;
    const deadline = performance.now() + SETTLE_MS;
    const attempt = () => {
      const available = room();
      if (available >= goal.y || performance.now() > deadline) {
        jump(Math.min(goal.y, available));
        return;
      }
      frame = requestAnimationFrame(attempt);
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [ready, signature]);

  // Record, from the moment there is a real page to have a position in. Taken
  // at the press rather than on every scroll — see the note at the top of the
  // file about which scroll is the visitor's.
  useEffect(() => {
    if (!ready) return;
    const remember = () => write(key, { y: window.scrollY, signature: latest.current });
    // Capture, on the document, so this runs before the press reaches the link
    // — React delegates its own listeners to a container inside `<body>`, and a
    // capturing listener up here is ahead of all of them. `pagehide` is the
    // other way out: a hard navigation, a reload, a closed tab.
    document.addEventListener('click', remember, true);
    window.addEventListener('pagehide', remember);
    return () => {
      document.removeEventListener('click', remember, true);
      window.removeEventListener('pagehide', remember);
    };
  }, [ready, key]);
}
