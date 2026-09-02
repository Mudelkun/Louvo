import type { HairShape } from '@/api/types';

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

export const TRY_ON_STEPS = 4;
