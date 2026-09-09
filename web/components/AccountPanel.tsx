'use client';

/**
 * The account surface, which is now the packs and nothing else.
 *
 * ## Everything above the packs was cut, including the balance
 *
 * This page used to be six sections — three stat tiles, the packs, a sign-in
 * card, a ledger, a four-cell inventory of browser storage, and the device key
 * printed at the bottom. Every one of those sentences was true, which is what
 * made it hard to delete any of them; taken together they answered questions
 * nobody had arrived with.
 *
 * The first cut left one number, drawn large, over the shelf. The second took
 * that too, and the reason is worth keeping: **the balance is already in the
 * header, on every page.** A count somebody has been watching in the top bar,
 * restated four inches lower in a 96px serif, is not more informative — it is
 * the same fact given the weight of a headline, on the one page where the
 * visitor's question is *how do I get more*. Somebody arrives here **because**
 * they already know the number.
 *
 * What went, and where it went rather than being lost:
 *
 * - **The balance.** `<SiteHeader>`, as a number and `<PreviewIcon>`, on every
 *   page rather than on the one you have to navigate to.
 * - **Signing in, out, and managing the account.** All three are in the header —
 *   `<AuthButtons>` before there is an identity, `<AccountMenu>` after. A second
 *   copy here was a second set of controls that could drift.
 * - **The ledger.** A per-credit audit trail is a support tool, and putting it
 *   under the packs made the page read like a statement.
 * - **What this browser keeps.** It is the privacy policy's subject and the
 *   privacy policy is a screen (`src/lib/legal.ts`), linked in the footer. Still
 *   worth saying, just not between somebody and the thing they came for.
 * - **The free/purchased split.** Three tiles for one number: the balance is
 *   what can be spent, and where it came from does not change what pressing
 *   Generate does.
 *
 * ## The two states that are not a shelf
 *
 * Both are kept, because both are the difference between a page that is empty
 * and a page that explains itself: a browser that cannot hold its device secret
 * has no identity to buy against, and a build with no `NEXT_PUBLIC_API_URL` has
 * no service to buy from. Same rule as `catalogSource()` — reported, never
 * disguised.
 */

import { hasApi } from '../lib/config';
import { useAccount } from '../lib/state/AccountContext';
import { Pricing } from './Pricing';
import { PurchaseHistory } from './PurchaseHistory';
import { Notice } from './ui';

export function AccountPanel() {
  const { usable } = useAccount();

  if (!usable) {
    return (
      <Notice
        tone="warn"
        title="This browser cannot be identified"
        body="Louvo keeps a random key in this browser's storage so it knows which previews are yours. Storage is blocked here — a private window, or site data turned off — so previews cannot be generated. Everything else on the site works."
      />
    );
  }

  if (!hasApi) {
    return (
      <Notice
        tone="warn"
        title="No service configured"
        body="This build has no NEXT_PUBLIC_API_URL, so there is nothing to buy and nothing to sign into."
      />
    );
  }

  /* `#packs` is minted into urls elsewhere — `<Pricing>` sends somebody through
     sign-in and back to it — so the anchor stays whatever else moves. */
  return (
    <section id="packs" className="scroll-mt-24">
      {/* The heading names what the money buys rather than what it is not.
          It was *Pay for previews, not for months.* — an anti-subscription line,
          which spends the largest words on the page denying something nobody had
          accused us of, and makes a subscription the first idea in the visitor's
          head. What somebody who has run out actually wants is another haircut
          on their own face, so the heading says that and the paragraph under it
          does the denying. */}
      <h1 className="font-display text-[clamp(2rem,4.6vw,2.8rem)] leading-[1.05] tracking-[-0.02em]">
        {/* One word in the brand, the same way `<TryOnFlow>`'s heading lifts
            *your own* out of its own sentence — `.text-gradient`, which is the
            only place the pink is allowed to touch type, since it is a gradient
            rather than a colour something is. Upright rather than italic: the
            hero italicises because it is drawing a contrast with somebody
            else's photograph, and there is no contrast being drawn here. */}
        Keep trying different <span className="text-gradient">hairstyles</span>.
      </h1>
      {/* Said before the prices rather than under them, and now the only place
          above the shelf where it is said at all. A row of cards with a figure at
          the top of each is the shape a subscription is usually sold in, so the
          words that rule out a monthly charge belong here rather than in a
          footnote below it. They are repeated on each card, where the number
          actually is. */}
      <p className="mx-auto mt-4 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        A one-time payment, not a subscription. Nothing renews, credits do not expire, and a
        generation that fails is refunded automatically.
      </p>
      <div className="mt-10">
        <Pricing />
      </div>

      {/* Under the packs, and that ordering is the argument. Somebody who
          navigates to this page is nearly always out of previews and looking for
          more; what they paid last month is what they came for second, if at
          all. See the header of `<PurchaseHistory>` for why a payment history
          is here when the credit ledger was cut. */}
      <PurchaseHistory />
    </section>
  );
}
