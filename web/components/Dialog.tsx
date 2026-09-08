'use client';

/**
 * The one overlay on the site, and the reason it is a component.
 *
 * There are two dialogues raised over a haircut — the packs (`<TopUpDialog>`)
 * and the sign-in wall (`<SignInWall>`) — and they are raised by the *same
 * button* for two readings of the same refusal. Written twice they would be two
 * overlays: two scroll locks, two Escape handlers, two guesses at how a card
 * behaves when it is taller than the phone it is on, and a fourth one the day a
 * third dialogue appears. So the chrome is here and each dialogue owns only what
 * it says.
 *
 * Three things in it are decisions rather than markup, and all three were
 * arrived at the hard way in `<TopUpDialog>`:
 *
 * - **The backdrop is a button, not a click handler on the overlay.** A way out
 *   that only a pointer can reach is not a way out. It is out of the tab order
 *   because the close control in the corner is the one a keyboard should land
 *   on — and Escape closes it regardless.
 * - **It is centred rather than dropped at the top.** The overlay scrolled its
 *   content from the top edge, so on a desktop screen a short card sat in the
 *   upper half over a screenful of empty backdrop and read as a panel that had
 *   not finished loading. `min-h-full` on a flex box inside the scroller is the
 *   one arrangement that does not have to choose: it centres while the card
 *   fits and the scroller takes over unchanged, from the top and with its
 *   padding intact, the moment the card is taller than the viewport.
 * - **The close is the affordance rather than a word, and it is out of the
 *   flow.** The content below it is centred on the card; a 40px button sharing
 *   its first line would centre that content on whatever width was left beside
 *   one.
 */

import { useEffect, type ReactNode } from 'react';

import { PreviewIcon } from './PreviewIcon';

export function Dialog({
  labelledBy,
  onClose,
  /** The card's own ceiling. The packs need a shelf; a short question does not. */
  maxWidth = '820px',
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
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
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas/85 backdrop-blur-2xl"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          style={{ maxWidth }}
          className={
            'brand-gradient animate-rise w-full rounded-[26px] p-px ' +
            'shadow-[0_50px_120px_-40px_rgb(0_0_0/0.95)]'
          }
        >
          <div className="relative rounded-[25px] bg-canvas-raised p-5 pt-7 sm:p-8">
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

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The balance, in the header pill's own shape.
 *
 * Both dialogues open with it, because both are raised *over a number* — the one
 * the button was refused on — and saying it where it is being complained about
 * rather than only in the top bar is what stops either of them reading as an
 * advertisement that arrived unprompted.
 *
 * It is read from the account at the moment it is drawn rather than assumed to
 * be zero. Neither dialogue is raised at any other balance today, but a paywall
 * that has *hardcoded* the number it is complaining about is one refactor away
 * from telling somebody with three previews that they have none — and
 * `ready: false` is not "no credits" here any more than anywhere else, so an
 * unread balance is a dash.
 */
export function BalancePill({ left }: { left: number | null }) {
  return (
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
  );
}
