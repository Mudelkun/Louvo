'use client';

/**
 * The doors into `/sign-in` and `/sign-up`, and the one thing they carry.
 *
 * ## They are links now, not modal openers
 *
 * `clerk.openSignIn()` put Clerk's card over whatever page it was pressed on.
 * That is gone: authentication is a page (`components/auth/AuthScreen.tsx` has
 * the argument), and these are ordinary links to it — which also means they can
 * be middle-clicked, opened in a second tab, and read by a crawler as the two
 * destinations they are.
 *
 * ## `?next=` is the whole of what the modal was protecting
 *
 * The reason sign-in was a dialogue in the first place was that a navigation
 * loses where somebody was standing: a cut, a length, a texture, a photograph.
 * So every door carries the path it was pressed on and the auth page puts the
 * visitor back on it — which is the same thing `<TopUpDialog>`'s checkout return
 * does with `CHECKOUT_RETURN_URL`, reached from the other side.
 *
 * The search string is picked up *after mount* rather than through
 * `useSearchParams()`, and that is not a shortcut. This component is rendered by
 * `<SiteHeader>`, which is in the root layout: a `useSearchParams()` in here
 * would take **every page on the site** out of the static render, or demand a
 * Suspense boundary around the header on all of them. Reading
 * `window.location.search` in an effect costs one attribute update on a link
 * nobody has clicked yet, and the server-rendered href — the path alone — is a
 * correct destination on its own.
 *
 * ## Both buttons, and why they are not one
 *
 * They answer different questions — *I have been here* and *I am new* — and a
 * returning visitor who only sees "Sign up" reads it as being asked to make a
 * second account. With no Clerk keys there is genuinely only one: the mailed
 * code runs through `upsertAccount`, which creates the account when the address
 * is new and finds it when it is not, so a separate sign-up would be the same
 * form under a second name.
 *
 * ## `collapse`, which is a width problem and nothing else
 *
 * The header's top bar carries the balance at every width now, and on a 390px
 * phone the logo, a pill, two 82px doors and a menu button do not fit on one
 * line. So `collapse` drops the *secondary* door — "Sign in" — below `md`,
 * leaving the primary one in the bar. Nothing is lost: the menu behind the
 * hamburger draws this same component **uncollapsed**, so both doors are one tap
 * away at exactly the width where one of them left the bar.
 *
 * **`md` rather than `sm`, and the hamburger is what sets it.** This collapsed
 * at `sm` first, which left a band — 640px to 768px, a small tablet or a phone
 * turned sideways — where the bar drew the logo, the wordmark, the pill, *both*
 * doors and the menu button, because the menu is `md:hidden` and appears below
 * 768 rather than below 640. The doors were then squeezed narrower than their
 * own labels and "Sign in" wrapped onto two lines inside a `h-9` pill. The two
 * breakpoints have to be one breakpoint: whatever leaves the bar is caught by
 * the menu, so it must leave exactly where the menu arrives.
 *
 * It collapses only when there are genuinely two. Without Clerk there is one
 * button and it is "Sign in", so collapsing would hide the only way in.
 */

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { hasClerk } from '../lib/config';
import { ButtonLink } from './ui';

/**
 * The path to come back to: where the visitor is standing, query string and all.
 *
 * `usePathname()` on the server render, refined once on the client — see the
 * header note above for why this is not `useSearchParams()`. Deliberately
 * without the hash: a fragment is never sent to the server anyway, and the two
 * places that use one (`/account#packs`) name it themselves.
 */
export function useReturnPath(): string {
  const pathname = usePathname();
  const [full, setFull] = useState(pathname);

  useEffect(() => {
    setFull(`${pathname}${window.location.search}`);
  }, [pathname]);

  return full;
}

/** `/sign-in?next=…`, with the query omitted when there is nothing to say. */
export function authHref(page: 'sign-in' | 'sign-up', next: string): string {
  return next === '/' ? `/${page}` : `/${page}?next=${encodeURIComponent(next)}`;
}

export function AuthButtons({ collapse = false }: { collapse?: boolean }) {
  const next = useReturnPath();

  // Only ever collapses a pair. See the header.
  const hidden = collapse && hasClerk ? 'hidden md:inline-flex' : '';

  return (
    <>
      <ButtonLink
        size="sm"
        variant="secondary"
        className={hidden}
        href={authHref('sign-in', next)}
      >
        Sign in
      </ButtonLink>
      {/* No separate sign-up without Clerk: one address, one code, and the
          account is created if it is new. See the header. */}
      {hasClerk ? (
        <ButtonLink size="sm" href={authHref('sign-up', next)}>
          Sign up
        </ButtonLink>
      ) : null}
    </>
  );
}
