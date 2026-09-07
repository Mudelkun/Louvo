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
 */

import type { ReactNode } from 'react';

import { AccountProvider } from '../lib/state/AccountContext';
import { CatalogProvider } from '../lib/state/CatalogContext';
import { GenerationProvider } from '../lib/state/GenerationContext';
import { SessionProvider } from '../lib/state/SessionContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <CatalogProvider>
        <SessionProvider>
          <GenerationProvider>{children}</GenerationProvider>
        </SessionProvider>
      </CatalogProvider>
    </AccountProvider>
  );
}
