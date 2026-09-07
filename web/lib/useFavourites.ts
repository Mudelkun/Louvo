'use client';

/**
 * The saved list, as React state, from the one store that holds it.
 *
 * Subscribed rather than read on mount, because the same cut is drawn in more
 * than one place on a page — see the note in `lib/looks.ts`.
 *
 * `null` is "not read yet", and it is the server snapshot on purpose.
 * `localStorage` does not exist during the render that produces the markup, so
 * a hook that answered `[]` there would draw an empty heart into the HTML and a
 * filled one a millisecond later — a hydration mismatch React resolves by
 * throwing the server's tree away. It also keeps the distinction *Cuts you
 * saved* depends on: nothing read yet is a placeholder, an empty list is
 * "no saved cuts". After a client-side navigation there is no server snapshot
 * and the real list is used immediately, so nothing flashes.
 */

import { useSyncExternalStore } from 'react';

import { readFavourites, subscribeFavourites } from './looks';

export function useFavourites(): string[] | null {
  return useSyncExternalStore(subscribeFavourites, readFavourites, () => null);
}

export function useIsFavourite(styleId: string): boolean {
  return useFavourites()?.includes(styleId) ?? false;
}
