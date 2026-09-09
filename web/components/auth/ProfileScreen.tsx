'use client';

/**
 * The frame around Clerk's `<UserProfile />`.
 *
 * Two things it adds and neither is decoration. A **way back to `/account`**,
 * because this page is Clerk's model of an identity and the thing the visitor
 * came to Louvo for — the balance, the packs, the ledger — is not in it; and an
 * answer for a **deployment with no Clerk keys**, where there is no profile to
 * manage and the honest thing is to say so rather than to render nothing.
 *
 * `<UserProfile />` is mounted rather than opened, on a path route, so the tabs
 * inside it are real urls. See `app/account/profile/[[...rest]]/page.tsx`.
 */

import { UserProfile } from '@clerk/nextjs';

import { hasClerk } from '../../lib/config';
import { ButtonLink, Notice, Overline } from '../ui';

export function ProfileScreen() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-24 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <Overline>Account</Overline>
      <h1 className="mt-3 font-display text-[clamp(1.7rem,3.6vw,2.4rem)] leading-tight tracking-[-0.015em] text-ink">
        Your profile
      </h1>
      <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-muted">
        Email addresses, connected accounts and devices. Your previews, packs and ledger are on
        your account page — this screen does not hold them.
      </p>

      <div className="mt-6">
        <ButtonLink href="/account" size="sm" variant="secondary">
          Previews and packs
        </ButtonLink>
      </div>

      <div className="mt-10">
        {hasClerk ? (
          <UserProfile
            routing="path"
            path="/account/profile"
            appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full' } }}
          />
        ) : (
          <Notice
            tone="warn"
            title="Nothing to manage here"
            body="This deployment signs in with a mailed code against Louvo's own API rather than through an identity provider, so there is no profile screen. Signing out and signing in with a different address is the whole of it."
          />
        )}
      </div>
    </main>
  );
}
