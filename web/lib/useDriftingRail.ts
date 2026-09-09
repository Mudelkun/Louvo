'use client';

/**
 * A shelf that drifts on its own **and** can be dragged with a finger.
 *
 * The rails were a CSS `transform` animation on a track inside an
 * `overflow-hidden` box, which drifts beautifully and cannot be touched: there
 * is no scroller, so a finger on a rail does nothing, and the only response the
 * row had to being touched was to stop. That is the wrong answer to the gesture
 * — somebody who puts a finger on a moving shelf of haircuts is asking to see
 * more of them, not to freeze the three that happen to be in front of them, and
 * on a phone a rail you cannot push is a rail whose far end does not exist.
 *
 * So the drift is **scroll position** rather than a transform. The box is a real
 * `overflow-x: auto` scroller, this hook adds a few tenths of a pixel to
 * `scrollLeft` every frame, and a drag is the platform's own scrolling — with
 * its momentum, its rubber-banding, its trackpad and keyboard behaviour, and
 * its scrollbar suppressed by `no-scrollbar` — rather than anything written
 * here. Nothing had to be added to make it draggable; the transform had to be
 * taken away.
 *
 * Four things about it are worth not re-deriving.
 *
 * **The loop is a wrap, and it has to apply to the finger too.** The track holds
 * two copies of the shelf, so half its scroll width is one copy: crossing that
 * point and subtracting it lands on the identical plate with nothing on screen
 * having moved. The drift wraps, and so does a drag — which is what makes
 * pushing the rail feel endless in both directions instead of hitting a wall at
 * a seam.
 *
 * **The user is detected by disagreement, not by events.** Every frame this
 * writes a value and remembers it; a `scroll` event whose position is not that
 * value came from somebody else — a drag, momentum, a wheel, a trackpad, a
 * keyboard. That one test covers every input without enumerating any of them,
 * and it handles iOS momentum for free: momentum keeps producing events, each
 * one pushes the resume time further out, and the drift starts again once the
 * rail has actually settled.
 *
 * **A pointer still stops it, for the original reason.** Every plate is a link,
 * and a link that slides out from under a cursor is a link nobody can click. A
 * mouse hovering pauses; so does focus landing inside, so the row cannot move
 * under somebody tabbing through it.
 *
 * **Reduced motion means no drift, never no scrolling.** The row is left
 * exactly where it is and stays a scroller, because a rail somebody can reach
 * the end of is the accessible version of this — a stopped marquee is a list
 * with its tail cut off.
 */

import { useEffect, type RefObject } from 'react';

/** How long after the rail last moved by itself before the drift resumes. */
const SETTLE_MS = 900;
/** A write and a read of `scrollLeft` can differ by a rounding error. */
const EPSILON = 1.5;

export function useDriftingRail(
  ref: RefObject<HTMLElement | null>,
  {
    secondsPerLoop,
    reverse = false,
    active = true,
  }: {
    /**
     * How long one copy of the shelf takes to go past.
     *
     * A duration rather than a speed, for the reason the CSS it replaced took
     * one: the callers set it from the item count (`items x SECONDS_PER_ITEM`),
     * so a short shelf and a long one drift at the same *speed* without either
     * of them having to know how wide a card is at the current breakpoint. The
     * pixels are measured off the rail each frame, so a card that is 150px on a
     * phone and 180px on a laptop needs no second number.
     */
    secondsPerLoop: number;
    /** Right to left, which is the front page's men's shelf. */
    reverse?: boolean;
    /** False while the rail is scrolled away — see `useOnScreen`. */
    active?: boolean;
  },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const still =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /** One copy of the shelf. Read per frame: images land and it grows. */
    const half = () => el.scrollWidth / 2;

    /**
     * Bring the position back inside the first copy.
     *
     * Called from the drift and from the scroll handler alike, so a finger that
     * pushes past either end comes out at the same plate on the other side and
     * the shelf has no far end to reach.
     */
    const wrap = () => {
      const size = half();
      if (size <= 0) return;
      if (el.scrollLeft >= size) el.scrollLeft -= size;
      else if (el.scrollLeft <= 0) el.scrollLeft += size;
    };

    // A rail running right to left starts a copy in, so there is somewhere to
    // go before the first wrap rather than one on the opening frame.
    if (reverse && el.scrollLeft === 0) el.scrollLeft = half();

    /** The last position this hook wrote — see the note on detection above. */
    let written = el.scrollLeft;
    let resumeAt = 0;
    let hovering = false;
    let focused = false;
    let frame = 0;
    let previous = 0;

    const onScroll = () => {
      if (Math.abs(el.scrollLeft - written) > EPSILON) {
        resumeAt = performance.now() + SETTLE_MS;
        wrap();
        written = el.scrollLeft;
      }
    };
    // A mouse pauses it; a finger does not, because a finger that is down is
    // already scrolling and the scroll handler above has it.
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') hovering = true;
    };
    const onLeave = () => {
      hovering = false;
    };
    const onFocusIn = () => {
      focused = true;
    };
    const onFocusOut = () => {
      focused = false;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    if (!still && active) {
      const step = (now: number) => {
        frame = requestAnimationFrame(step);
        const elapsed = previous ? Math.min(now - previous, 64) : 0;
        previous = now;
        if (hovering || focused || now < resumeAt) return;
        // Measured per frame, so the speed survives a breakpoint change and the
        // images landing underneath it.
        const speed = half() / Math.max(secondsPerLoop, 0.001);
        el.scrollLeft += (reverse ? -1 : 1) * speed * (elapsed / 1000);
        wrap();
        written = el.scrollLeft;
      };
      frame = requestAnimationFrame(step);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [ref, secondsPerLoop, reverse, active]);
}
