'use client';

/**
 * The balance in the header, counting up to a purchase instead of jumping to it.
 *
 * The header pill asks this what to draw instead of drawing `credits.total`
 * directly. Almost always the answer is `credits.total` — this hook is inert
 * until a grant is announced, and it goes back to being inert the moment one
 * finishes.
 *
 * ## It is not an optimistic balance, and the difference is the whole point
 *
 * The rule is that this client never adjusts a balance locally. Both ends of
 * this roll are the server's own numbers — see `lib/celebrate.ts` — and the
 * values in between are on screen for under a second on their way to one of
 * them. Three things keep it that way and are worth not unpicking:
 *
 * - **It never counts up to a number it was not given.** The target is `to` from
 *   the grant, not `total` plus anything.
 * - **Any other change wins immediately.** If the balance moves to something
 *   other than the roll's target while it is running — a generation settling in
 *   another tab, a refund — the roll is abandoned and the server's number is
 *   drawn. A celebration is never allowed to be the reason a number is wrong.
 * - **It ends in the resting state, not in a held one.** The override is dropped
 *   at the end rather than left holding `to`, so the pill is reading `total`
 *   again a frame later.
 *
 * ## Why it reads the clock rather than counting frames
 *
 * Every position is computed from `grant.at`, which is when the purchase was
 * announced, so a pill that mounts mid-flight joins the animation where it
 * actually is. That case is not exotic: on a return from Stripe the pill is not
 * drawn until the first account read lands, and the confirmation can beat it.
 * A hook that started its own clock on mount would run the whole count-up after
 * the chip had already landed.
 *
 * Reduced motion opts out completely — no hold and no roll, so the number simply
 * is what the server says. A held-back balance is the one part of this that
 * would be a small lie if the motion explaining it were switched off.
 */

import { useEffect, useRef, useState } from 'react';

import { HOLD_MS, ROLL_MS, lastGrant, onGrant, type CreditGrant } from './celebrate';
import { prefersReducedMotion } from './useReducedMotion';

/** Decelerating, so the last few previews land rather than stopping dead. */
const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

export interface CreditRoll {
  /** The number to draw. */
  shown: number;
  /** True while the chip is arriving and the count is moving, for the pop. */
  landing: boolean;
}

export function useCreditRoll(total: number): CreditRoll {
  /** Null whenever nothing is being celebrated, which is nearly always. */
  const [override, setOverride] = useState<number | null>(null);
  const [landing, setLanding] = useState(false);

  /** The grant being drawn, so a `total` that disagrees can abandon it. */
  const active = useRef<CreditGrant | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const run = (grant: CreditGrant) => {
      active.current = grant;
      const from = Math.max(0, grant.to - grant.amount);

      const step = () => {
        const elapsed = Date.now() - grant.at;

        if (elapsed < HOLD_MS) {
          // Held at the old number while the chip is in the air: the flight is
          // what explains the change, so the change may not precede it.
          setOverride(from);
          frame.current = requestAnimationFrame(step);
          return;
        }

        const progress = Math.min(1, (elapsed - HOLD_MS) / ROLL_MS);
        setOverride(Math.round(from + (grant.to - from) * ease(progress)));
        setLanding(progress < 1);

        if (progress < 1) {
          frame.current = requestAnimationFrame(step);
          return;
        }

        // Back to resting: the server's number, drawn by the caller.
        active.current = null;
        setOverride(null);
      };

      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(step);
    };

    // A grant announced before this pill existed is joined where it is, not
    // replayed. Anything already finished is ignored by `step` on its first
    // frame, which lands past the end and clears itself.
    const pending = lastGrant();
    if (pending && Date.now() - pending.at < HOLD_MS + ROLL_MS) run(pending);

    const off = onGrant(run);
    return () => {
      off();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  /**
   * The server disagreeing with the roll ends the roll.
   *
   * Not a guard against a bug — it is the ordinary case of the balance moving
   * for a second reason while this one is being drawn, and the only defensible
   * answer to that is the number the server just gave us.
   */
  useEffect(() => {
    const grant = active.current;
    if (grant && total !== grant.to) {
      cancelAnimationFrame(frame.current);
      active.current = null;
      setOverride(null);
      setLanding(false);
    }
  }, [total]);

  return { shown: override ?? total, landing };
}
