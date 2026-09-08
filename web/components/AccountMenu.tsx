'use client';

/**
 * The mark for a signed-in account, and the one place to leave from.
 *
 * It replaced a letter in a circle linking to `/account`. Two things were wrong
 * with that and they are the two things this fixes:
 *
 * - **The letter was the first character of an email address**, which is the
 *   least a signed-in person can be told about who they are signed in as. When
 *   the identity came from Google there is a real picture and a real name behind
 *   it — Clerk carries both on the session — so the mark is the profile
 *   photograph, the menu names the person, and the address is under the name
 *   rather than being the whole of it. The initial is still what a deployment
 *   with no Clerk keys, or an account with no picture, falls back to: a broken
 *   image is worse than a letter, and `hasImage` is the only honest way to know
 *   which of the two Clerk is about to serve — `imageUrl` is never empty,
 *   because Clerk generates initials into a PNG when there is nothing else.
 * - **Signing out was only on `/account`.** The way out of a product should not
 *   be somewhere you have to navigate to, and the header is where every site
 *   puts it. It is a menu rather than a bare button beside the avatar because a
 *   header has room for one control per idea: the avatar answers *who am I*, and
 *   what is behind it — billing, the profile, the door out — belongs under the
 *   thing it is about. The balance is not in here: it is the pill beside this
 *   mark, where it is visible without a click.
 *
 * The menu is a popover rather than a `<dialog>`: it is a short list attached to
 * the control that opened it, so it must not take the page over, lock the scroll
 * or dim what is behind it the way `<TopUpDialog>` does. That one interrupts;
 * this is furniture.
 *
 * ## Clerk, or not at all
 *
 * Split into two components for the reason `<AuthButtons>` is: `useUser()` and
 * `useClerk()` throw outside `<ClerkProvider>`, which is only mounted when there
 * is a publishable key, and a hook cannot be called conditionally. `hasClerk` is
 * inlined at build time, so the branch is the same on every render of a given
 * build.
 */

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { hasClerk } from '../lib/config';
import { useAccount } from '../lib/state/AccountContext';
import { Spinner } from './ui';

interface Identity {
  /** The profile photograph, or null when there is not a real one to show. */
  imageUrl: string | null;
  name: string | null;
  email: string | null;
  /** Clerk's own account screen, where this deployment has one. */
  manageHref: string | null;
}

/**
 * The circle, at whatever size it is asked for.
 *
 * The photograph is a plain `<img>` rather than `next/image`, which is the rule
 * the whole site follows (see `next.config.ts`): re-optimising a 96px avatar
 * through a rewriting proxy costs a round trip to save nothing. `onError` falls
 * back to the initial rather than leaving a broken frame — the url is a third
 * party's and this control has to be right on the day it is not answering.
 */
function Avatar({
  identity,
  label,
  size,
}: {
  identity: Identity;
  label: string;
  size: number;
}) {
  const [broken, setBroken] = useState(false);

  // A changed url is a different account, and a stale "broken" would hide a
  // picture that is perfectly fine.
  useEffect(() => setBroken(false), [identity.imageUrl]);

  const shell =
    'grid shrink-0 place-items-center overflow-hidden rounded-full bg-violet/18 ' +
    'font-bold uppercase text-violet-ink ring-1 ring-inset ring-violet/40';

  return (
    <span
      className={shell}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {identity.imageUrl && !broken ? (
        <img
          src={identity.imageUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        label.slice(0, 1)
      )}
    </span>
  );
}

const ITEM =
  'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-[13.5px] ' +
  'font-medium text-ink-soft transition-colors duration-150 hover:bg-white/6 hover:text-ink ' +
  'disabled:pointer-events-none disabled:opacity-55';

/**
 * The popover, and one deliberate omission: there is no `role="menu"` on it and
 * no `role="menuitem"` on its rows.
 *
 * That role is a promise about the keyboard — arrow keys move between items,
 * Home and End jump, Tab leaves the whole widget — and a screen reader announces
 * it as such. This is a link and two buttons in DOM order, which Tab already
 * walks correctly; claiming the role without implementing the navigation would
 * describe a control that does not answer the keys it says it answers. So the
 * panel is labelled and tied to the button that opens it, and Escape closes it.
 */
function AccountMenuView({ identity }: { identity: Identity }) {
  const { signOut } = useAccount();
  const pathname = usePathname();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const label = identity.name ?? identity.email ?? 'Account';

  // A menu left open across a navigation is a menu covering the page somebody
  // just asked for — the same rule the mobile nav in `<SiteHeader>` follows.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    // `pointerdown` rather than `click`, so a press that starts outside closes
    // the menu without also activating whatever it landed on.
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account — signed in as ${label}`}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={
          'grid h-9 w-9 place-items-center rounded-full transition-[box-shadow,transform] ' +
          'duration-200 hover:ring-2 hover:ring-violet/45 ' +
          (open ? 'ring-2 ring-violet/55' : '')
        }
      >
        <Avatar identity={identity} label={label} size={36} />
      </button>

      {open ? (
        <div
          id={panelId}
          aria-label="Account"
          className={
            // Opaque, not `glass`. The header's own translucency works because
            // what is behind it is the top of a page; a panel this size opens
            // over the hero — somebody's photograph, at full contrast — and a
            // 0.72 ground let the picture through the words. A menu has to be
            // read at a glance, so it gets the raised canvas and the ring, the
            // same ground `<TopUpDialog>` puts its card on.
            'absolute right-0 top-[calc(100%+10px)] w-[264px] rounded-[18px] bg-canvas-raised ' +
            'p-2 ring-1 ring-inset ring-line-strong shadow-[0_28px_70px_-24px_rgb(0_0_0/0.95)]'
          }
          style={{ animation: 'luvo-rise 0.18s ease-out both' }}
        >
          {/* Who this is. The name and the address are both here because they
              answer different halves of the question, and the address is the
              half that decides it when somebody has two accounts. Both truncate
              rather than wrap: a menu that changes height with the length of an
              email address is a menu that moves under the cursor. */}
          <div className="flex items-center gap-3 px-2 pb-3 pt-2">
            <Avatar identity={identity} label={label} size={38} />
            <div className="min-w-0">
              {identity.name ? (
                <p className="truncate text-[13.5px] font-semibold leading-tight text-ink">
                  {identity.name}
                </p>
              ) : null}
              <p
                className={
                  'truncate leading-tight ' +
                  (identity.name ? 'mt-0.5 text-[12px] text-muted' : 'text-[13px] font-semibold text-ink')
                }
                title={identity.email ?? undefined}
              >
                {identity.email ?? 'Signed in'}
              </p>
            </div>
          </div>

          <div className="mx-2 mb-1 h-px bg-line" />

          {/* *Billing*, not *Account & credits*. The label was written when
              `/account` was six sections — a balance, the packs, sign-in, a
              ledger and an inventory of browser storage — and had to name all of
              them at once. That page is the packs now: the balance moved to the
              header pill and the profile is its own row directly below this one,
              so a row saying "account" would point at a page that no longer
              holds one. One word for the one errand behind it. */}
          <Link href="/account" className={ITEM}>
            <WalletIcon />
            Billing
          </Link>

          {identity.manageHref ? (
            <Link href={identity.manageHref} className={ITEM}>
              <PersonIcon />
              Manage profile
            </Link>
          ) : null}

          {/* The door out. Not a `danger` button: signing out destroys nothing —
              the credits stay on the account and the looks were never the
              account's — so a red control here would be a warning about a
              consequence that does not exist. The line under it is the same
              sentence `/account` says beside its own control, for the same
              reason: it answers the thing somebody hesitates over. */}
          <button
            type="button"
            className={ITEM}
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void signOut().finally(() => setLeaving(false));
            }}
          >
            {leaving ? <Spinner /> : <LeaveIcon />}
            Sign out
          </button>
          <p className="px-3 pb-1.5 pt-1 text-[11.5px] leading-relaxed text-faint">
            Your credits stay on the account, and your saved looks stay in this browser.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The mark drawn from Clerk's session, which is where a Google picture and a
 * real name actually live.
 *
 * The API's own `account` is still the fallback for both fields: it is what a
 * mailed-code sign-in produces, and it is what is there for the moment between
 * this browser being adopted and Clerk's user resolving.
 */
function ClerkAccountMenu({ email, displayName }: { email: string | null; displayName: string | null }) {
  const { user } = useUser();

  return (
    <AccountMenuView
      identity={{
        // `hasImage` is the question, not `imageUrl`: Clerk always returns a
        // url, generating an initials PNG when there is no real picture — and
        // that generated one is a worse version of the fallback below it.
        imageUrl: user?.hasImage ? user.imageUrl : null,
        name: user?.fullName ?? displayName,
        email: user?.primaryEmailAddress?.emailAddress ?? email,
        // A page rather than `openUserProfile()`, for the reason sign-in is one:
        // one kind of surface for one kind of errand.
        manageHref: '/account/profile',
      }}
    />
  );
}

function PlainAccountMenu({ email, displayName }: { email: string | null; displayName: string | null }) {
  return (
    <AccountMenuView
      identity={{ imageUrl: null, name: displayName, email, manageHref: null }}
    />
  );
}

export function AccountMenu({ email, displayName }: { email: string | null; displayName: string | null }) {
  return hasClerk ? (
    <ClerkAccountMenu email={email} displayName={displayName} />
  ) : (
    <PlainAccountMenu email={email} displayName={displayName} />
  );
}

/* -------------------------------------------------------------------------- */
/* Marks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The three menu marks, in the site's 24-box at one stroke weight, drawn in
 * `currentColor` so each one follows the row it sits in. Same rule as the nav
 * icons in `<SiteHeader>`: they say what is behind the row rather than
 * decorating the word.
 */
function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="3.5" y="6" width="17" height="12.5" rx="2.6" />
        <path d="M3.5 10.5h17" />
        <circle cx="16.6" cy="14.6" r="1.1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="8.6" r="3.6" />
        <path d="M5 19.4c1.3-3.3 3.7-5 7-5s5.7 1.7 7 5" />
      </g>
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 4.5h-7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
        <path d="M11.8 12h8.2m0 0-2.8-2.8M20 12l-2.8 2.8" />
      </g>
    </svg>
  );
}
