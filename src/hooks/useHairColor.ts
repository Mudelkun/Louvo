import { useMemo } from 'react';

import type { HairColor } from '@/api/types';
import { BASE_HAIR_COLOR } from '@/lib/constants';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';

/**
 * Resolves a catalog colour id to the shade to draw in.
 *
 * The colour list is catalog data like everything else, so an unknown id — an
 * old saved look, a colour the server has since dropped — resolves to the shade
 * the catalog was rendered in rather than to nothing.
 */
export function useHairColorById(colorId: string | null | undefined): HairColor {
  const { colors } = useCatalog();
  return useMemo(
    () => colors.find((entry) => entry.id === colorId) ?? BASE_HAIR_COLOR,
    [colors, colorId],
  );
}

/** The shade the user is currently browsing in. */
export function useHairColor(): HairColor {
  const { colorId } = useSession();
  return useHairColorById(colorId);
}

/**
 * The shade a finished look was generated in.
 *
 * Deliberately not the session colour: a saved look is a picture of a decision
 * already made, so it keeps the colour it was made in even after the user has
 * moved the picker on.
 */
export function useLookColor(look: { options?: { color?: string } } | null | undefined): HairColor {
  return useHairColorById(look?.options?.color);
}
