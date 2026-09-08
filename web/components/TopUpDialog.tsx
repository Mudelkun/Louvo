'use client';

/**
 * The paywall, raised by the button that was going to generate — **once there is
 * an account to spend against.**
 *
 * It is one of two readings of an empty balance and it is the second one. A
 * visitor who has never signed in gets `<SignInWall>` instead: credits live on
 * an account, so every Buy button in here would send them to `/sign-in` anyway,
 * and a first sign-in grants a credit. See that file for the argument. This one
 * is what somebody with an account and no previews is owed.
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
 * ## The overlay is `<Dialog>`
 *
 * The scroll lock, the Escape key, the reachable backdrop, the centring and the
 * close control are all in that file now, because the sign-in wall raised by the
 * same button needs every one of them and a second hand-rolled overlay is a
 * second set of answers to how a card behaves on a phone. What is left here is
 * what this dialogue *says*.
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
 * The balance is the one number it repeats, in `<BalancePill>`, read from
 * `useAccount()` at the moment it is drawn rather than assumed — see that
 * component for why a paywall must not hardcode the number it is complaining
 * about.
 */

import { useAccount } from '../lib/state/AccountContext';
import { BalancePill, Dialog } from './Dialog';
import { Pricing } from './Pricing';

export function TopUpDialog({ onClose }: { onClose: () => void }) {
  const { credits, ready } = useAccount();

  return (
    <Dialog labelledBy="top-up-title" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        {/* What they have, first — the number the button was refused over. */}
        <BalancePill left={ready ? credits.total : null} />

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
    </Dialog>
  );
}
