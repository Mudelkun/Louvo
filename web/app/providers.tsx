'use client';

/**
 * Every provider the site needs, in the order they depend on each other.
 *
 * One client boundary at the root rather than one per page. The catalog is a
 * single document fetched once for the whole session (see `CatalogContext`), and
 * a provider mounted per route would refetch it on every navigation — which is
 * the one thing this architecture is arranged to avoid.
 *
 * The nesting is not arbitrary. `GenerationProvider` reads nothing from the
 * catalog but is read *by* pages that also read the catalog, and `AccountProvider`
 * is refreshed when a generation settles, so it sits outside. Anything added
 * here should be placed by what it depends on, not alphabetically.
 *
 * ## Clerk is outermost, and conditional
 *
 * Outermost because `<ClerkBridge>` needs both it and `AccountProvider`, and
 * conditional because `<ClerkProvider>` throws without a publishable key — a
 * fresh clone of this repository has to serve the catalogue and the try-on with
 * no Clerk account at all, and the sign-in dialog falls back to the mailed code
 * there. Same rule as `hasApi`: a missing key is a reported
 * state, never a crash. The import is unconditional and only the *rendering* is
 * guarded, because importing the package is harmless and a dynamic import here
 * would make the provider tree asynchronous for no gain.
 *
 * The appearance is set once, here, rather than per component. The sign-in
 * dialog is ours and is built on Clerk's hooks, so this only reaches the screens
 * Clerk owns outright — but one of those in Clerk's default light theme, reached
 * from a near-black site, reads as having left the site.
 */

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

import { hasClerk } from '../lib/config';
import { AccountProvider } from '../lib/state/AccountContext';
import { CatalogProvider } from '../lib/state/CatalogContext';
import { ClerkBridge } from '../lib/state/ClerkBridge';
import { GenerationProvider } from '../lib/state/GenerationContext';
import { SessionProvider } from '../lib/state/SessionContext';

function Inner({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      {hasClerk ? <ClerkBridge /> : null}
      <CatalogProvider>
        <SessionProvider>
          <GenerationProvider>{children}</GenerationProvider>
        </SessionProvider>
      </CatalogProvider>
    </AccountProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  if (!hasClerk) return <Inner>{children}</Inner>;

  return (
    <ClerkProvider
      /* Clerk's own links — the footer of its card, an expired session, a
         redirect out of a protected action — have to land on the pages this app
         mounts rather than on Clerk's hosted ones at `accounts.dev`, which are
         not this site and are not in this palette. Set here rather than as
         `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, so a deployment cannot be configured
         into disagreeing with the routes that exist in the build. */
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorPrimary: '#a98cfb',
          colorPrimaryForeground: '#0b0910',
          colorBackground: '#0f0d14',
          colorForeground: '#f4f1f7',
          colorMutedForeground: '#a29dad',
          colorInput: '#17141d',
          colorInputForeground: '#f4f1f7',
          colorBorder: 'rgba(255,255,255,0.10)',
          borderRadius: '0.9rem',
        },
      }}
    >
      <Inner>{children}</Inner>
    </ClerkProvider>
  );
}
