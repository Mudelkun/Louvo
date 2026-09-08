'use client';

/**
 * The other reading of an empty balance: **nobody to spend against.**
 *
 * `<TopUpDialog>` is the right answer to *you have run out* — the packs, over
 * the cut, with nothing lost by closing it. It is the wrong answer to *you have
 * run out and this browser has never signed in*, which is the state most
 * visitors are in when they hit zero, and it is wrong in two ways at once.
 *
 * **It is a dead end wearing a Buy button.** Credits live on an account, so a
 * purchase made anonymously would be money spent into a browser's
 * `localStorage`. `<Pricing>` already knows that and sends a signed-out Buy to
 * `/sign-in` carrying the pack — which means the packs dialogue, shown to
 * somebody signed out, is a shelf of three prices where every button is a
 * detour to the page this one leads to directly.
 *
 * **And it asks for money at the one moment there is something free to hand
 * over.** A first sign-in carries `grantSignupBonus`, so the visitor who does
 * what this dialogue asks can generate again without paying. That is why the
 * heading offers *more hairstyles* rather than a number: naming the bonus turns an
 * account into a transaction — "give us your email, get a preview" — which is
 * the shape of a trick even when the offer is real, and it is a promise about a
 * server-side constant (`SIGNUP_BONUS_CREDITS`) that this file cannot see and
 * must not guess at. The credit is a consequence of signing in, not the reason
 * given for it. Somebody who signs in and finds a preview waiting has been
 * treated well; somebody promised one has been sold something.
 *
 * *Press Generate again* is the one thing here that leans on that constant being
 * non-zero, and it is the weakest sentence that still says something true: a
 * deployment that sets `SIGNUP_BONUS_CREDITS=0` makes it a promise about the
 * packs instead, which is a line to revisit rather than a bug to leave.
 *
 * So this is the whole dialogue: what you have, why the button did not fire, and
 * the one door out of it. No packs — buying is behind this door anyway, and a
 * price shown to somebody who has not yet made an account is a number with
 * nothing attached to it, the same argument the site makes for having deleted
 * `/pricing`. Somebody who is signed in and out of credits gets `<TopUpDialog>`,
 * unchanged.
 *
 * ## It carries where it was raised
 *
 * `?next=` is the whole of what a dialogue was protecting when sign-in was one
 * (`components/auth/AuthScreen.tsx` has that argument), so both doors here are
 * the ordinary `authHref` ones every other door on the site uses — the cut, its
 * length and its texture are in the path, and the visitor is put back on them.
 *
 * **The photograph comes back too**, which it did not when this dialogue was
 * written. It is an object url — a handle the *document* holds — and a provider
 * that returns as a fresh page load was therefore taking somebody's picture away
 * as the price of doing what this dialogue asked, at the exact moment they had
 * just agreed to make an account. `pendingPhoto.ts` is the fix and
 * `SessionContext` is where it is adopted. The line at the bottom says so,
 * because the whole cost of this dialogue is the doubt about what is on the
 * other side of it.
 */

import { useAccount } from '../lib/state/AccountContext';
import { hasClerk } from '../lib/config';
import { authHref, useReturnPath } from './AuthButtons';
import { BalancePill, Dialog } from './Dialog';
import { ButtonLink } from './ui';

export function SignInWall({ onClose }: { onClose: () => void }) {
  const { credits, ready } = useAccount();
  const next = useReturnPath();

  return (
    <Dialog labelledBy="sign-in-wall-title" onClose={onClose} maxWidth="460px">
      <div className="flex flex-col items-center text-center">
        <BalancePill left={ready ? credits.total : null} />

        <span className="mt-5 text-[34px] leading-none" aria-hidden>
          🔑
        </span>

        <h2
          id="sign-in-wall-title"
          className="mt-3 font-display text-[clamp(1.4rem,4vw,1.85rem)] leading-tight text-ink"
        >
          Sign in to preview more hairstyles.
        </h2>
        <p className="mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-muted">
          Keep trying different hairstyles — make an account and press Generate again.
        </p>

        <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          {/* The new account is the primary answer and the returning one is
              beside it, which is the opposite weighting to the header's doors.
              The header is asked by anybody; this is raised at somebody whose
              browser has spent its free previews and has never signed in, which
              is overwhelmingly a first account rather than a forgotten one. */}
          {hasClerk ? (
            <>
              <ButtonLink size="lg" href={authHref('sign-up', next)} className="sm:flex-none">
                Create an account
              </ButtonLink>
              <ButtonLink
                size="lg"
                variant="secondary"
                href={authHref('sign-in', next)}
                className="sm:flex-none"
              >
                Sign in
              </ButtonLink>
            </>
          ) : (
            /* One door without Clerk, named for both things it does. There is no
               separate sign-up route to send anybody to: the mailed code runs
               through `upsertAccount`, which creates the account when the
               address is new and finds it when it is not. Two buttons over one
               form would be the same errand under two names — and this is the
               wording `app/credits.tsx` already uses for the same door. */
            <ButtonLink size="lg" href={authHref('sign-in', next)} className="sm:flex-none">
              Sign in or create an account
            </ButtonLink>
          )}
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-muted">
          You come back to this cut, with your photo and everything else as you left it.
        </p>
      </div>
    </Dialog>
  );
}
