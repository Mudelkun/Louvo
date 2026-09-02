import type { HairColor, HairShape } from '@/api/types';

/**
 * Sentinel photo uri used by the "use a sample photo" path.
 *
 * It lets the whole flow be exercised on a simulator, on the web, or with photo
 * permissions denied. Anywhere a photo would be shown, this renders the neutral
 * mannequin instead — and the "generated" result renders the same mannequin
 * wearing the chosen style, so before/after stays meaningful.
 */
export const DEMO_PHOTO = 'hairify://sample-photo';

/** The hair the sample subject starts with, before any style is applied. */
export const DEMO_BASE_SHAPE: HairShape = {
  top: 0.3,
  sides: 0.34,
  back: 0.12,
  fringe: 0.34,
  texture: 'wavy',
};

/**
 * The shade the whole catalog is drawn and rendered in, and the anchor every
 * colour grade starts from.
 *
 * `hex` is not a design choice. It is the mean colour of the hair pixels across
 * every render in `assets/mannequins`, measured with the same luma threshold the
 * generator uses to tell hair from mannequin. The generator asks for espresso
 * #33231B (`HAIR_COLOUR` in `scripts/lib/prompts.mjs`) and gets back something a
 * shade warmer than that; what a grade has to start from is what actually came
 * back, not what was asked for. Re-measure this if the catalog is ever re-shot.
 *
 * Picking this shade in the app is therefore a no-op: `hairGrade()` returns null
 * for it and the render is shown untouched. See `src/lib/colorGrade.ts`.
 */
export const BASE_HAIR_COLOR: HairColor = {
  id: 'espresso',
  name: 'Espresso',
  hex: '#392D24',
  shade: '#241B15',
};

export const TRY_ON_STEPS = 4;
