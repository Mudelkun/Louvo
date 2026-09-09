'use client';

/**
 * The site's one navigation.
 *
 * Two things it does that a marketing header usually does not, and both are
 * consequences of this being a shopfront *and* the product:
 *
 * - **The credit balance is in it, once there is one to show.** Generation costs
 *   a credit and the whole funnel ends at a purchase, so the number should never
 *   be somewhere the visitor has to go looking for. It is drawn from the server's
 *   answer only — `ready: false` shows nothing rather than showing zero, because
 *   a "0 credits" that turns out to be "not loaded yet" is the one mistake this
 *   number can make. It is a number and `<PreviewIcon>` rather than a number and
 *   a word, which is what pays for the next sentence: the mark carries the noun,
 *   so the pill does not change width between "1 preview" and "12 previews" and
 *   is narrow enough to sit in a **phone** bar, which "3 previews" was not — it
 *   used to be `sm:` and up, with the menu behind the hamburger carrying it on a
 *   phone, which is the one width where somebody is most likely to be about to
 *   spend one. The room comes from `<AuthButtons collapse>`, which drops the
 *   secondary door below `sm`.
 * - **A generation in flight is a live link back to it.** Leaving the wait
 *   costs the view, not the work, so there has to be a way back in from
 *   anywhere. Without it, navigating away reads as having lost the preview.
 * - **Sign in *and* Sign up are both here, rather than only on `/account`.**
 *   They are links to `/sign-in` and `/sign-up`, each carrying the path it was
 *   pressed on so the visitor is put back where they were — which is how a page
 *   keeps the one thing the modal these replaced was protecting. Both are shown
 *   because they answer different questions, *I have been
 *   here* and *I am new*; `<AuthButtons>` has the rest of that argument. Once
 *   there is an account they become the mark for it, and the balance beside it
 *   stops being a fact about this browser.
 * - **So is the way out.** That mark is `<AccountMenu>`: the profile photograph
 *   where the identity came with one, and under it the name, the address, the
 *   account page and Sign out. Signing out lived only on `/account`, which made
 *   leaving the one errand on this site you had to go somewhere to do.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { isTerminal } from '../lib/api';
import { BALANCE_ANCHOR_ID } from '../lib/celebrate';
import { hasApi } from '../lib/config';
import { useCreditRoll } from '../lib/useCreditRoll';
import { useAccount } from '../lib/state/AccountContext';
import { useGeneration } from '../lib/state/GenerationContext';
import { AccountMenu } from './AccountMenu';
import { AuthButtons } from './AuthButtons';
import { Logo } from './Logo';
import { PreviewIcon } from './PreviewIcon';

/**
 * Two links, and both of them are places with something in them.
 *
 * There is no "How it works" and no "Pricing" here any more. Both were pages
 * *about* the product on a site where the product is the home page, and a
 * navigation whose first two entries are explanations tells a visitor they are
 * expected to read before they are allowed to try. The explanation that was
 * worth keeping — what happens to your photograph — is on the upload box itself,
 * where the decision is actually made, and the packs are on `/account`, where
 * somebody who has run out needs them.
 */
const LINKS = [
  { href: '/styles', label: 'Catalogue', Icon: GridIcon },
  { href: '/looks', label: 'My looks', Icon: FrameIcon },
];

/**
 * The two nav marks.
 *
 * Drawn rather than imported, in the same 24-box the rest of the site's icons
 * use (`FavouriteButton`, `ShareButton`): one stroke weight, `currentColor`, so
 * a mark inherits whatever the link is doing — muted at rest, ink when it is the
 * page. Both say what is *behind* the link rather than decorating the word: the
 * catalogue is a grid of plates, and a look is a finished picture. Neither is a
 * scissors, which is the app's verb and belongs on the button that spends a
 * credit.
 */
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="4" y="4" width="7" height="7" rx="1.6" />
        <rect x="13" y="4" width="7" height="7" rx="1.6" />
        <rect x="4" y="13" width="7" height="7" rx="1.6" />
        <rect x="13" y="13" width="7" height="7" rx="1.6" />
      </g>
    </svg>
  );
}

function FrameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2.6" />
        <path d="M4.6 16.2 9 12.2l3.4 3 2.3-1.9 4.7 3.9" />
        <circle cx="14.9" cy="8.7" r="1.5" />
      </g>
    </svg>
  );
}

/**
 * The mark on "My looks" while a preview is still being made.
 *
 * Inline in the flow of the label rather than absolutely positioned on the
 * link's corner: a badge floating over a text link is read as a notification
 * count and there is nothing to count. The screen reader gets the words, since a
 * coloured dot says nothing at all without them.
 */
function PendingDot() {
  return (
    <>
      <span
        aria-hidden
        className="brand-gradient -ml-0.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full align-middle"
        style={{ animation: 'luvo-breathe 1.6s ease-in-out infinite' }}
      />
      <span className="sr-only">(a preview is still generating)</span>
    </>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { credits, ready, account, usable } = useAccount();
  const { shown, landing } = useCreditRoll(credits.total);
  const { job, savedLookId } = useGeneration();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A menu left open across a navigation is a menu covering the page somebody
  // just asked for.
  useEffect(() => setOpen(false), [pathname]);

  const working = job && !isTerminal(job);

  /**
   * Whether the gallery is holding a preview that is not finished.
   *
   * Broader than `working` by one status on purpose: a `ready` job has an image
   * on the server and none in this browser yet, so the tile on `/looks` is still
   * a spinner and the mark beside the link should still be there. `savedLookId`
   * is what ends it — the moment the look is written to IndexedDB the tile
   * becomes the picture and the mark has nothing left to point at.
   */
  const unfinished = !!job && (working || (job.status === 'ready' && !savedLookId));

  /**
   * Whether there is anything to sign into from here.
   *
   * Two conditions, both of which make the control a lie rather than a
   * limitation if ignored: a build with no `NEXT_PUBLIC_API_URL` has no service
   * behind it, and a browser that cannot keep its device secret — a private
   * window, site data turned off — has no device for an account to be adopted
   * onto, so the request would 401 on the way out. `/account` explains both in
   * words; the header simply does not offer what it cannot do.
   *
   * `ready` is the third gate and it is the same rule the balance follows: the
   * account arrives with the first successful read, so drawing this before then
   * would show "Sign in" for a moment to somebody who already is.
   */
  const offerSignIn = hasApi && usable && ready;

  return (
    <header
      className={
        'sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ' +
        (scrolled || open ? 'glass border-b border-line' : 'border-b border-transparent')
      }
    >
      {/* `gap-3` below `sm`: with the balance in the bar the phone line is
          logo, pill, door, menu, and at 360px the 24px gutter between the logo
          and the group is the difference between fitting and the door being
          squeezed. Nothing above `sm` changes. */}
      <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center gap-3 px-5 sm:gap-6 sm:px-8 lg:px-12">
        <Link href="/" className="shrink-0" aria-label="Louvo, home">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const marked = unfinished && link.href === '/looks';
            const { Icon } = link;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] ' +
                  'font-medium transition-colors duration-200 ' +
                  (active ? 'text-ink' : 'text-muted hover:text-ink-soft')
                }
              >
                <Icon />
                {link.label}
                {/* The gallery has something in it that is not a picture yet.
                    A dot rather than a count, because there is only ever one job
                    in flight in a browser, and it breathes rather than spins so
                    it reads as a mark on a link rather than as a control. */}
                {marked ? <PendingDot /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 md:ml-0">
          {working ? (
            <Link
              href="/studio/generating"
              className={
                'hidden items-center gap-2 rounded-full bg-violet/15 px-3.5 py-2 text-[12.5px] ' +
                'font-semibold text-violet-ink ring-1 ring-inset ring-violet/35 sm:inline-flex'
              }
            >
              <span
                aria-hidden
                className="brand-gradient h-1.5 w-1.5 rounded-full"
                style={{ animation: 'luvo-breathe 1.6s ease-in-out infinite' }}
              />
              Generating
            </Link>
          ) : null}

          {ready ? (
            /* The word is in the label rather than on screen: the mark says
               "preview" and the number is the only thing that changes, so the
               pill stays the same width whatever the balance is. A screen
               reader still gets the noun, since a mark on its own is not one. */
            <Link
              id={BALANCE_ANCHOR_ID}
              href="/account"
              /* The label is the server's number, never the rolling one. A count
                 that is mid-animation is a fact about a transition; announcing
                 each step of it would read out four balances in a second. */
              aria-label={`${credits.total} ${credits.total === 1 ? 'preview' : 'previews'} left`}
              className={
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 ' +
                'text-[12.5px] text-muted ring-1 ring-inset transition-colors duration-300 ' +
                'hover:text-ink sm:px-3.5 ' +
                (landing ? 'bg-violet/15 ring-violet/45' : 'bg-white/5 ring-line')
              }
            >
              {/* The count-up, and the pop that says the chip landed here. Both
                  run only during a grant — see `useCreditRoll`, which is inert
                  the rest of the time and hands back `credits.total` unchanged. */}
              <span
                className="tnum font-bold text-ink"
                style={landing ? { animation: 'luvo-pop 0.5s var(--ease-out-quint)' } : undefined}
              >
                {shown}
              </span>
              <PreviewIcon
                className={
                  'h-[15px] w-[15px] text-violet transition-transform duration-300 ' +
                  (landing ? 'scale-125' : '')
                }
              />
            </Link>
          ) : null}

          {offerSignIn ? (
            account ? (
              <AccountMenu email={account.email} displayName={account.displayName} />
            ) : (
              <div className="flex items-center gap-2">
                <AuthButtons collapse />
              </div>
            )
          ) : null}

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-inset ring-line md:hidden"
          >
            <span aria-hidden className="relative block h-3 w-4">
              <span
                className="absolute left-0 h-[1.5px] w-4 rounded bg-ink transition-transform duration-300"
                style={{ top: open ? 5 : 0, transform: open ? 'rotate(45deg)' : 'none' }}
              />
              <span
                className="absolute left-0 h-[1.5px] w-4 rounded bg-ink transition-transform duration-300"
                style={{ bottom: open ? 5.5 : 0, transform: open ? 'rotate(-45deg)' : 'none' }}
              />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-line px-5 pb-6 pt-2 md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                'relative flex items-center gap-2.5 border-b border-line py-3.5 text-[15px] ' +
                'font-medium text-ink-soft last:border-b-0'
              }
            >
              <link.Icon />
              {link.label}
              {unfinished && link.href === '/looks' ? <PendingDot /> : null}
            </Link>
          ))}
          {/* No balance row here. It used to be the menu's job because the top
              bar only had room for the words "3 previews" from `sm`; a number
              and a mark fit at every width, so the bar carries it always and a
              second copy in here would be one more thing to keep in step. */}
          {/* The doors, uncollapsed — the bar drops "Sign in" below `sm` to make
              room for the balance, and this is where it lands. Signed in there
              is nothing to offer here: the account's own menu is in the bar. */}
          {offerSignIn && !account ? (
            <div className="flex items-center gap-2 pt-3">
              <AuthButtons />
            </div>
          ) : null}
        </nav>
      ) : null}

    </header>
  );
}
