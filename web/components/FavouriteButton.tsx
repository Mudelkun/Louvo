'use client';

/**
 * Keeping a cut for later.
 *
 * Device-local, in `localStorage`, and deliberately so: a favourite is a short
 * list of catalogue ids, not imagery, and it is the one piece of state here that
 * would be worth moving to an account when there is one. A saved *look* is a
 * picture of somebody's face and stays on their machine (see `lib/looks.ts`);
 * a favourite is a preference about the catalogue and could reasonably follow
 * them.
 *
 * The state comes from the store in `lib/looks.ts` rather than from a read on
 * mount, because there is more than one of this button on a page now and two
 * hearts for one cut must not disagree.
 *
 * ## Two grounds, and only two
 *
 * `panel` is the button on the scheme's own surface — the style page's header —
 * and it is drawn in the palette. `plate` is the one that sits *on* a render,
 * where the ground is the catalogue's flat white and the palette's muted bone
 * would be invisible: it is drawn in plate ink, the same chip the type caption
 * on a card uses, and its saved state is `violet-deep` rather than `violet-ink`
 * for the reason `--color-on-plate` exists at all — the light palette's accent
 * is the one that carries on white.
 */

import { toggleFavourite } from '../lib/looks';
import { useIsFavourite } from '../lib/useFavourites';

export interface FavouriteButtonProps {
  styleId: string;
  /** Named in the label, so a grid of hearts is not twenty identical buttons. */
  styleName?: string;
  variant?: 'panel' | 'plate';
  className?: string;
}

const SHELL: Record<'panel' | 'plate', { base: string; saved: string; idle: string; icon: string }> = {
  panel: {
    base: 'h-11 w-11',
    saved: 'bg-violet/18 text-violet-ink ring-violet/45',
    idle: 'bg-white/5 text-muted ring-line hover:text-ink',
    icon: 'h-[18px] w-[18px]',
  },
  plate: {
    base: 'h-10 w-10 backdrop-blur-sm',
    saved: 'bg-white/90 text-violet-deep ring-violet-deep/30',
    idle: 'bg-white/80 text-on-plate-muted ring-on-plate/15 hover:text-on-plate-ink',
    icon: 'h-[17px] w-[17px]',
  },
};

export function FavouriteButton({
  styleId,
  styleName,
  variant = 'panel',
  className = '',
}: FavouriteButtonProps) {
  const saved = useIsFavourite(styleId);
  const shell = SHELL[variant];
  const subject = styleName ?? 'this cut';

  return (
    <button
      type="button"
      onClick={() => toggleFavourite(styleId)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${subject} from your list` : `Save ${subject} to your list`}
      className={
        'grid shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors ' +
        'duration-200 ' +
        shell.base +
        ' ' +
        (saved ? shell.saved : shell.idle) +
        ' ' +
        className
      }
    >
      <svg viewBox="0 0 24 24" className={shell.icon} aria-hidden focusable="false">
        <path
          d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.2a4.4 4.4 0 0 1 7.5 2.7c0 4.9-7.5 9.6-7.5 9.6Z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
