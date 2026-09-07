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
 * Two things it deliberately does not do:
 *
 * - **It does not pretend the button worked.** No hold is taken, no job is
 *   created, nothing is queued behind a purchase. The generation happens when
 *   the visitor presses Generate again with a credit to spend, which is one tap
 *   and is the truth.
 * - **It does not carry a second copy of the packs.** `<Pricing />` is the one
 *   place they are drawn, reading published `credit_products` rows, so adding a
 *   pack stays a row rather than a release — and the fact that checkout is not
 *   open yet is stated by that component in both places it appears, rather than
 *   in a sentence here that could drift out of step with it.
 *
 * The shape is the site's other two modals — fixed overlay, locked body scroll,
 * the brand hairline, Escape and the backdrop both cancelling — so it reads as
 * the same kind of interruption rather than as a fourth invention.
 */

import { useEffect } from 'react';

import { Pricing } from './Pricing';
import { ButtonLink, Overline } from './ui';

export function TopUpDialog({ onClose }: { onClose: () => void }) {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="top-up-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas/85 px-4 py-8 backdrop-blur-2xl sm:px-6"
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

      <div className="relative mx-auto w-full max-w-[880px]">
        <div className="brand-gradient animate-rise rounded-[30px] p-px shadow-[0_50px_120px_-40px_rgb(0_0_0/0.95)]">
          <div className="rounded-[29px] bg-canvas-raised p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="min-w-0">
                <Overline>Out of previews</Overline>
                <h2
                  id="top-up-title"
                  className="mt-3 font-display text-[clamp(1.7rem,4.5vw,2.2rem)] leading-tight text-ink"
                >
                  You have used your previews.
                </h2>
                <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                  Your cut is still on the page behind this. Pick up more previews and press
                  Generate again — nothing renews, they do not expire, and a generation that
                  fails is refunded automatically.
                </p>
              </div>

              {/* The close, as the affordance rather than as a word: the packs
                  below are the subject, and a labelled *Cancel* beside a
                  heading that has not asked a question reads as an answer to
                  one. */}
              <button
                type="button"
                autoFocus
                onClick={onClose}
                aria-label="Close"
                className={
                  'ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/6 text-ink-soft ' +
                  'ring-1 ring-inset ring-line transition-colors duration-200 hover:bg-white/10 hover:text-ink'
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
            </div>

            <div className="mt-8">
              <Pricing />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/account" size="sm" variant="secondary">
                See my balance
              </ButtonLink>
              <button
                type="button"
                onClick={onClose}
                className="text-[12.5px] text-muted underline underline-offset-4 hover:text-ink"
              >
                Back to the cut
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
