'use client';

/**
 * The receipt, shown on whatever page the visitor came back to.
 *
 * A purchase does not start on `/account` most of the time. It starts in
 * `<TopUpDialog>`, over a haircut, at the moment somebody ran out of previews —
 * and `<Pricing>` sends that page as the return path so the cut, the length and
 * the texture are exactly where they were left. Which means the confirmation
 * cannot live on the balance page: it has to be able to appear anywhere.
 *
 * So it is mounted once, in the root layout, and reads
 * `AccountContext.checkout`. That provider is where the return is actually
 * handled — the session read back from Stripe, the query string cleared, the
 * balance re-fetched — and this is only its voice.
 *
 * Three decisions worth keeping:
 *
 * - **It is a bar at the top of the page, not a toast.** A toast that fades is
 *   the wrong shape for the one message in this product that is about money;
 *   somebody who looks away for four seconds should not have to wonder whether
 *   their payment went through. It stays until dismissed.
 * - **It never claims the credits are there when it does not know.** The four
 *   outcomes are genuinely different — paid and applied, paid and settling,
 *   nothing charged, and paid-but-we-could-not-read-it-back — and the last one
 *   is the interesting case: Stripe has the money and the webhook will land, so
 *   saying "payment failed" there would be a lie in the direction that costs a
 *   support ticket. This is the same rule the generating screen follows.
 * - **It is `aria-live`.** The confirmation arrives asynchronously after a
 *   navigation, which is precisely the case a screen reader is otherwise never
 *   told about.
 *
 * ## The paid outcome is the one that celebrates, and it names the amount
 *
 * `bought` used to be the same grey row as the other four: *Paid — your previews
 * are on your account*, over a sentence about expiry and refunds. Everything
 * about it was true and it never said **how many**, while the number the visitor
 * had just paid to change ticked over unremarked in the corner of the header.
 * The single most positive moment in the product was drawn as a notice.
 *
 * So the paid branch says `+5`, in the brand gradient, and then hands the amount
 * to the balance: the chip flies to the header pill and the count rolls up as it
 * lands (`lib/celebrate.ts` holds the schedule the three pieces share). That is
 * the whole argument for the animation — it is not decoration, it is the line
 * connecting a number somebody paid for to the number that changed, which are
 * otherwise at opposite ends of the page and a second apart in time.
 *
 * Four things keep it from being a gimmick:
 *
 * - **The amount is the server's** — `purchased` on the confirmation, which is
 *   the `credit_products` row and not a difference between two balances. The
 *   banner has no arithmetic in it.
 * - **The flight is a clone, and the chip stays put.** The `+5` in the bar does
 *   not move; a copy of it is what travels. So the receipt still reads as a
 *   receipt after the animation, and a visitor who arrives mid-flight or looks
 *   away has lost nothing but the gesture.
 * - **It runs once per grant.** Keyed on the grant id, so a re-render — a
 *   refresh landing, a dismissal elsewhere — cannot relaunch it.
 * - **It degrades in three ways, all silent.** No balance pill on screen (a
 *   build with no API, or an account read still in flight), no Web Animations,
 *   or reduced motion: the chip simply stays where it is and the number changes
 *   without ceremony. Nothing about the message depends on the animation having
 *   happened.
 */

import { useEffect, useRef } from 'react';

import { BALANCE_ANCHOR_ID, FLIGHT_MS, LAUNCH_DELAY_MS, lastGrant } from '../lib/celebrate';
import { useAccount } from '../lib/state/AccountContext';
import { prefersReducedMotion } from '../lib/useReducedMotion';
import { PreviewIcon } from './PreviewIcon';
import { Spinner } from './ui';

interface Message {
  title: string;
  body: string;
  tone: 'good' | 'neutral' | 'warn';
  busy?: boolean;
}

const MESSAGES: Record<string, Message> = {
  confirming: {
    title: 'Finishing up',
    body: 'Checking the payment with Stripe.',
    tone: 'neutral',
    busy: true,
  },
  bought: {
    title: 'Paid — your previews are on your account',
    body: 'They do not expire, nothing renews, and a generation that fails is refunded automatically.',
    tone: 'good',
  },
  pending: {
    title: 'Payment started',
    body: 'Your payment method settles rather than clearing instantly. The previews are added the moment it does — you do not need to stay on this page.',
    tone: 'warn',
  },
  cancelled: {
    title: 'Nothing was charged',
    body: 'You left the checkout before paying, so your balance is exactly as it was.',
    tone: 'neutral',
  },
  failed: {
    title: 'Paid — we could not read it back just now',
    body: 'Stripe has the payment and it will land on your account by itself. Nothing is lost and nothing needs doing.',
    tone: 'warn',
  },
};

const RING: Record<Message['tone'], string> = {
  good: 'ring-jade/35',
  warn: 'ring-amber/35',
  neutral: 'ring-line',
};

/**
 * Sends a copy of the chip to the balance in the header.
 *
 * A cloned node animated on the `<body>` rather than the chip itself, because
 * the chip is inside a bar with `overflow` and a stacking context of its own,
 * and something that has to cross the whole page cannot be laid out by the thing
 * it is leaving. Fixed positioning off the two `getBoundingClientRect()`s is the
 * only measurement involved.
 *
 * Transform and opacity only, so the whole thing is composited and nothing here
 * causes a layout. The arc is a third keyframe offset upwards — a straight line
 * between two points reads as a UI element being repositioned, and a curve reads
 * as something thrown.
 */
function flyToBalance(chip: HTMLElement): void {
  const target = document.getElementById(BALANCE_ANCHOR_ID);
  if (!target || typeof chip.animate !== 'function') return;

  const from = chip.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const copy = chip.cloneNode(true) as HTMLElement;
  copy.setAttribute('aria-hidden', 'true');
  Object.assign(copy.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '80',
    pointerEvents: 'none',
  });
  document.body.appendChild(copy);

  const animation = copy.animate(
    [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      // The top of the arc, and the moment it is largest: the chip is thrown
      // rather than slid, and it grows on the way out so the eye follows it.
      {
        transform: `translate3d(${dx * 0.45}px, ${dy * 0.35 - 46}px, 0) scale(1.18)`,
        opacity: 1,
        offset: 0.45,
      },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.42)`, opacity: 0 },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(0.34, 0.02, 0.2, 1)', fill: 'forwards' },
  );

  animation.onfinish = () => copy.remove();
  animation.oncancel = () => copy.remove();
}

export function CheckoutBanner() {
  const { checkout, checkoutCredits, dismissCheckout } = useAccount();

  const chip = useRef<HTMLSpanElement | null>(null);
  /** The grant already flown, so a re-render cannot launch a second chip. */
  const flown = useRef<number | null>(null);

  const celebrating = checkout === 'bought' && checkoutCredits > 0;

  useEffect(() => {
    if (!celebrating || prefersReducedMotion()) return;

    const grant = lastGrant();
    if (!grant || flown.current === grant.id) return;
    flown.current = grant.id;

    // The beat before it leaves is what makes the flight a link rather than a
    // flourish: the `+5` has to be read where it appears first.
    const timer = window.setTimeout(() => {
      if (chip.current) flyToBalance(chip.current);
    }, LAUNCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  if (!checkout) return null;

  const message = MESSAGES[checkout];
  if (!message) return null;

  return (
    <div aria-live="polite" className="mx-auto w-full max-w-[1240px] px-5 pt-5 sm:px-8 lg:px-12">
      <div
        className={
          'flex items-center gap-4 rounded-[18px] px-5 py-4 ring-1 ring-inset ' +
          (celebrating
            ? 'animate-rise bg-violet/10 ring-violet/40'
            : `bg-surface/80 ${RING[message.tone]}`)
        }
      >
        {message.busy ? <Spinner className="text-muted" /> : null}

        {celebrating ? (
          /* The amount, as the first thing in the bar and the largest thing in
             it. This is the node that is cloned into flight; it does not move
             itself, so the receipt still reads as one afterwards. */
          <span
            ref={chip}
            className={
              'brand-gradient inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 ' +
              'text-[16px] font-extrabold text-on-violet shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)]'
            }
          >
            <span className="tnum">+{checkoutCredits}</span>
            <PreviewIcon className="h-[17px] w-[17px]" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">
            {celebrating
              ? `${checkoutCredits} ${checkoutCredits === 1 ? 'preview' : 'previews'} added — go and try something`
              : message.title}
          </p>
          <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
            {celebrating
              ? 'Paid, and on your account. They do not expire, nothing renews, and a generation that fails is refunded automatically.'
              : message.body}
          </p>
        </div>

        {/* No dismiss while the answer is still being fetched: a bar somebody
            closes mid-check is a question they never got an answer to. */}
        {message.busy ? null : (
          <button
            type="button"
            onClick={dismissCheckout}
            aria-label="Dismiss"
            className={
              'grid h-8 w-8 shrink-0 place-items-center self-start rounded-full text-ink-soft ' +
              'transition-colors duration-200 hover:bg-white/8 hover:text-ink'
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden focusable="false">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
