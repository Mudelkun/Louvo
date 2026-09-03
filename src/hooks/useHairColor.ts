import { useMemo } from 'react';

import type { HairColor } from '@/api/types';
import { useCatalog } from '@/state/CatalogContext';
import { useSession } from '@/state/SessionContext';

/**
 * Resolves a catalog colour id to the shade to draw in, or null for "the shade
 * it was shot in".
 *
 * A session normally has an id — it starts at `DEFAULT_HAIR_COLOR_ID` — so null
 * here is the older-look and unknown-id case rather than the everyday one.
 *
 * Null is not a missing value, it is the absence of a *choice*, and it has to
 * stay distinct from any particular shade: the grade is anchored per variant
 * (espresso for most renders, black for coily — see `BASE_HAIR_COLORS`), so
 * resolving "nothing picked" to one catalog-wide shade grades every render shot
 * in the other one. That is how a black coily render came out brown. With null,
 * `hairGrade()` short-circuits and the render is shown untouched, whichever
 * shade it was shot in.
 *
 * The colour list is catalog data like everything else, so an unknown id — an
 * old saved look, a colour the server has since dropped — resolves the same way:
 * the imagery as generated, rather than a guess at what was meant.
 */
export function useHairColorById(colorId: string | null | undefined): HairColor | null {
  const { colors } = useCatalog();
  return useMemo(
    () => (colorId ? colors.find((entry) => entry.id === colorId) ?? null : null),
    [colors, colorId],
  );
}

/** The shade the user is currently browsing in, or null while none is picked. */
export function useHairColor(): HairColor | null {
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
export function useLookColor(look: { options?: { color?: string } } | null | undefined): HairColor | null {
  return useHairColorById(look?.options?.color);
}
