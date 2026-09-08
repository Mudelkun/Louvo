'use client';

/**
 * The one moment in this product worth celebrating, and the clock that keeps
 * three pieces of it in step.
 *
 * A purchase used to land as a grey bar reading *Paid — your previews are on
 * your account*, while the number the visitor had just paid to change ticked
 * over in the corner of the header with nothing drawing the eye to it. Both
 * halves were true and neither was legible: the sentence never names the amount,
 * and the balance changes in a place nobody is looking at the instant a page
 * loads. So somebody who has just spent money is told, in the flattest possible
 * terms, that something happened somewhere else.
 *
 * What replaces it is one gesture across three components — `<CheckoutBanner>`
 * shows a **+5**, that chip flies to the balance in the header, and the balance
 * counts up as it lands. They are three files and they must agree about *when*,
 * which is what this module is: one event carrying the whole schedule, and the
 * constants that schedule is written in.
 *
 * ## The number is the server's, and so are both ends of the roll
 *
 * The rule this codebase does not bend is that the client never adjusts a
 * balance locally — no optimistic increment, ever, because the number moves
 * without this tab being involved. A count-up looks exactly like the thing that
 * rule forbids and is not: **both ends of it are server numbers.** `to` is the
 * balance `/v1/checkout/confirm` just reported, and `from` is that balance minus
 * what the server said the purchase was worth. Nothing between them is ever
 * displayed as a resting value — the roll finishes on `to` within a second, and
 * any other change to the balance overrides it immediately.
 *
 * `amount` comes from the server too (`purchased` on the confirm reply) rather
 * than from the difference between two readings, because on a return from Stripe
 * the page is a **fresh load**: the first balance this tab ever read may already
 * include the pack, and a difference computed here would be zero exactly when
 * the webhook was fast, which is most of the time.
 *
 * ## Why a module event rather than another provider
 *
 * The three participants sit in different parts of the tree — the banner and the
 * header are siblings in the root layout — so the state has to be above both.
 * `AccountContext` is where it would go and is the wrong home: that provider is
 * the one place in this app that is about money being right, and a presentation
 * cue with a duration in it does not belong in the same object as the balance.
 * A subscription list in a module is the whole mechanism, it needs no provider
 * to be mounted, and a component that never subscribes is unaffected.
 *
 * Late subscribers matter here, which is why the last event is kept. On a return
 * from Stripe the confirmation can resolve before the header has a balance to
 * draw — the pill is not rendered until the first account read lands — and an
 * event fired into an empty room would mean the flight arrives at a number that
 * never moved. `lastGrant()` lets a component that mounts mid-flight join it at
 * the right point rather than replay it from the start.
 */

/** The schedule for one grant, as every participant reads it. */
export interface CreditGrant {
  /** Distinguishes two grants in one session; not otherwise meaningful. */
  id: number;
  /** Previews bought, as the server reported them. The `+5`. */
  amount: number;
  /** The balance afterwards — the server's number, and where the roll ends. */
  to: number;
  /** When it was announced, so a late subscriber can work out where it is. */
  at: number;
}

/**
 * The beat before the chip leaves.
 *
 * Long enough that the `+5` is read where it appears rather than only as
 * something that flew past — the flight is the *link* between the amount and the
 * balance, and a link between two things nobody looked at is decoration.
 */
export const LAUNCH_DELAY_MS = 520;

/** How long the chip is in the air. */
export const FLIGHT_MS = 820;

/** How long the balance takes to count up once the chip has landed. */
export const ROLL_MS = 900;

/**
 * How long the balance is held at its old value before it rolls.
 *
 * The header is told this rather than working it out, so the hold and the flight
 * cannot drift apart into a number that jumps before the chip arrives — or, more
 * visibly, one that has already jumped by the time it does.
 */
export const HOLD_MS = LAUNCH_DELAY_MS + FLIGHT_MS;

/**
 * The id the flight aims at.
 *
 * A DOM id rather than a ref passed down, because the two ends of this animation
 * are in components that never meet: the banner is mounted in the root layout
 * and the pill lives inside the header's own conditional. Nothing breaks when it
 * is absent — a build with no API never draws the pill, and `<CheckoutBanner>`
 * skips the flight and says the same thing without it.
 */
export const BALANCE_ANCHOR_ID = 'luvo-balance';

type Listener = (grant: CreditGrant) => void;

const listeners = new Set<Listener>();
let last: CreditGrant | null = null;
let nextId = 1;

/** Announces a purchase. Called once, by `AccountContext`, on a confirmed buy. */
export function announceGrant(amount: number, to: number): void {
  if (amount <= 0) return;
  last = { id: nextId++, amount, to, at: Date.now() };
  for (const listener of listeners) listener(last);
}

/** The most recent grant, for a component that mounted after it was announced. */
export const lastGrant = (): CreditGrant | null => last;

/** Subscribes to grants. Returns its own unsubscribe, as an effect wants. */
export function onGrant(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
