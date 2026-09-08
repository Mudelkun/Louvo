'use client';

/**
 * The paywall, raised by the button that was going to generate.
 *
 * The style page used to swap its primary button for a link to `/account` the
 * moment the balance hit zero — *Top up to keep going*. That is honest and it is
 * still the wrong control. Somebody standing on a cut with their photograph
 * loaded has one intention, and the page answering it with a different verb
 * pointing at a different page reads as a refusal: the thing they came to press
 * is gone, and what replaced it is an errand. Worse, the errand *is* a
 * navigation — the cut, the length and the texture on screen are left behind,
 * and coming back means finding the page again.
 *
 * So the button keeps saying what it does. Pressing it with no credits opens
 * this instead of submitting: the same packs, over the page they were already
 * on, with the cut still behind it and nothing lost by closing it. The price is
 * named at the moment it is actually owed, which is the same argument the app
 * makes for having no paywall in its first run and the site makes for having
 * deleted `/pricing`.
 *
 * ## It is a short dialogue, and that is a correction
 *
 * It opened on an overline, a display heading and a four-line paragraph
 * explaining that the cut was still behind it, that nothing renews, that credits
 * do not expire and that a failure is refunded — over three cards each carrying
 * a price, a "one-time payment" rubric, a unit price and a sentence of its own,
 * over a footnote saying two of those things again, over two more controls.
 * Every sentence was true and the whole was a page of reading raised at somebody
 * who had pressed one button. A paywall is read in about two seconds, and what
 * it owes the reader is **what they have**, **why the button did not fire** and
 * **what to do about it**. The rest is a footnote, and the parts of it worth
 * keeping are one line under the packs rather than a paragraph over them.
 *
 * So: the balance, the reason, the packs, one line. `<Pricing compact>` is the
 * same shelf with the same prices and the same button, drawn without the prose
 * that belongs on `/account` — where somebody has gone deliberately to read
 * about their account rather than landed while trying to do something else.
 *
 * ## It is centred rather than dropped at the top
 *
 * The overlay scrolled its content from the top edge, so on a desktop screen the
 * card sat in the upper half with a screenful of empty backdrop under it and
 * read as a panel that had not finished loading. The content is in a
 * `min-h-full` flex box instead: it centres while it fits and the scroller takes
 * over unchanged — from the top, padding intact — the moment the card is taller
 * than the viewport. That is the one arrangement that does not have to choose
 * between a short dialogue on a laptop and a tall one on a phone.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not pretend the button worked.** No hold is taken, no job is
 *   created, nothing is queued behind a purchase. The generation happens when
 *   the visitor presses Generate again with a credit to spend, which is one tap
 *   and is the truth.
 * - **It does not carry a second copy of the packs.** `<Pricing />` is the one
 *   place they are drawn, reading published `credit_products` rows and the
 *   Stripe Prices they point at, so adding a pack stays a row plus a Price
 *   rather than a release. It also carries the sale itself: pressing Buy in here
 *   leaves for Stripe's hosted checkout and comes back to **this page**, because
 *   `<Pricing>` sends the current path as the return path. The cut, the length
 *   and the texture are where they were left, which is the whole reason this is
 *   a dialogue over the page rather than a trip to `/account`.
 * - **It does not carry a second copy of what checkout costs or whether it is
 *   open.** Both are the API's answer, said by `<Pricing>` in both places it
 *   appears, rather than in a sentence here that could drift out of step.
 *
 * The balance is the one number it repeats, and it is read from `useAccount()`
 * at the moment it is drawn rather than assumed. The dialogue is only ever
 * raised at zero today, but a paywall that has *hardcoded* the number it is
 * complaining about is one refactor away from telling somebody with three
 * previews that they have none — and `ready: false` is not "no credits" here any
 * more than it is anywhere else, so an unread balance is a dash rather than a 0.
 */

import { useEffect } from 'react';

import { useAccount } from '../lib/state/AccountContext';
import { Pricing } from './Pricing';
import { PreviewIcon } from './PreviewIcon';

export function TopUpDialog({ onClose }: { onClose: () => void }) {
  const { credits, ready } = useAccount();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = ready ? credits.total : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="top-up-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas/85 backdrop-blur-2xl"
    >
      {/* The backdrop as something focusable rather than a click handler on the
          overlay — a way out only a pointer can reach is not a way out. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      {/* `min-h-full` on a flex box inside the scroller is what centres a short
          dialogue on a laptop without trapping a tall one on a phone: the box is
          at least as tall as the viewport, so `items-center` centres it while it
          fits and the scroller takes over the moment it does not. */}
      <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className={
            'brand-gradient animate-rise w-full max-w-[820px] rounded-[26px] p-px ' +
            'shadow-[0_50px_120px_-40px_rgb(0_0_0/0.95)]'
          }
        >
          <div className="relative rounded-[25px] bg-canvas-raised p-5 pt-7 sm:p-8">
            {/* The close, as the affordance rather than as a word, and out of
                the flow: the message below is centred on the card, and a 40px
                button sharing its first line would centre it on whatever width
                was left beside one. */}
            <button
              type="button"
              autoFocus
              onClick={onClose}
              aria-label="Close"
              className={
                'absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/6 ' +
                'text-ink-soft ring-1 ring-inset ring-line transition-colors duration-200 ' +
                'hover:bg-white/10 hover:text-ink sm:right-4 sm:top-4'
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="flex flex-col items-center text-center">
              {/* What they have, first, in the header pill's own shape — the
                  number the button was refused over, said where it is being
                  complained about rather than only in the top bar. */}
              <p
                className={
                  'inline-flex items-center gap-1.5 rounded-full bg-white/6 px-3 py-1.5 ' +
                  'text-[12.5px] font-semibold text-ink ring-1 ring-inset ring-line'
                }
              >
                <PreviewIcon className="h-[15px] w-[15px] text-violet" />
                <span className="tnum">{left ?? '—'}</span>
                <span className="text-muted">{left === 1 ? 'preview left' : 'previews left'}</span>
              </p>

              <span className="mt-5 text-[34px] leading-none" aria-hidden>
                😔
              </span>

              <h2
                id="top-up-title"
                className="mt-3 font-display text-[clamp(1.5rem,4vw,2rem)] leading-tight text-ink"
              >
                Oops, no more previews.
              </h2>
              <p className="mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-muted">
                Keep trying different hairstyles — pick up a pack and press Generate again.
              </p>
            </div>

            <div className="mt-7">
              <Pricing compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
