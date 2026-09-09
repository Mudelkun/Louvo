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
 *
 * ## Saving is answered, and un-saving is only acknowledged
 *
 * The press used to be answered by a colour fading over two hundred
 * milliseconds — under the thumb that was covering the button while it happened.
 * The commonest way to find out whether a save had landed was to press again,
 * which undid it. So a save now fills the heart, pops it, rings it, throws
 * sparks off it and taps the phone, and a *removal* gets one small compression
 * and nothing else. That asymmetry is itself the feedback: a burst means saved,
 * and there is no way to read one as the other. The motion lives in
 * `globals.css`; what is here is when to run it.
 *
 * Two details worth not unpicking:
 *
 * - **The burst is keyed on a counter, not on the saved state.** Pressing twice
 *   in a second is two answers, and an animation that only restarts when a class
 *   changes plays once and then sits still through every press after it.
 * - **Reduced motion renders none of it.** Not a switched-off animation — the
 *   nodes are never mounted, so what is left is the filled heart and the colour,
 *   which are the *state* rather than a performance of it.
 */

import { useEffect, useState, type CSSProperties } from 'react';

import { toggleFavourite } from '../lib/looks';
import { useIsFavourite } from '../lib/useFavourites';
import { useReducedMotion } from '../lib/useReducedMotion';

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

/**
 * The burst, as eight directions rather than a symmetrical ring of one dot.
 *
 * Alternating sizes and distances is what stops it reading as a mechanical
 * asterisk: real feedback is slightly uneven. The distance is written negative
 * because the keyframe is a plain `translateY` after a rotation — see
 * `luvo-like-spark`.
 */
const SPARKS = Array.from({ length: 8 }, (_, index) => ({
  '--a': `${index * 45}deg`,
  '--d': index % 2 ? '-15px' : '-21px',
  '--s': index % 2 ? '3px' : '4px',
  animationDelay: index % 2 ? '30ms' : '0ms',
})) as CSSProperties[];

/** The longest of the four, plus a frame. */
const BURST_MS = 600;

/**
 * The one channel that is not on screen.
 *
 * Twelve milliseconds is a tap rather than a buzz — long enough to be felt by
 * the thumb already touching the glass, short enough not to read as an error.
 * Android has it, iOS Safari does not, and a browser that refuses is not worth
 * hearing about: the other four channels are the confirmation and this is the
 * one on top of them.
 */
function tap() {
  try {
    navigator.vibrate?.(12);
  } catch {
    // Unsupported, or blocked by a permissions policy. Nothing to report.
  }
}

export function FavouriteButton({
  styleId,
  styleName,
  variant = 'panel',
  className = '',
}: FavouriteButtonProps) {
  const saved = useIsFavourite(styleId);
  const reduced = useReducedMotion();
  const shell = SHELL[variant];
  const subject = styleName ?? 'this cut';

  /** Which way the last press went, and which press it was — see the header. */
  const [beat, setBeat] = useState<{ n: number; saving: boolean } | null>(null);

  useEffect(() => {
    if (!beat) return;
    const timer = setTimeout(() => setBeat(null), BURST_MS);
    return () => clearTimeout(timer);
  }, [beat]);

  const press = () => {
    const saving = !saved;
    toggleFavourite(styleId);
    if (reduced) return;
    setBeat((previous) => ({ n: (previous?.n ?? 0) + 1, saving }));
    if (saving) tap();
  };

  const bursting = Boolean(beat?.saving);

  return (
    <button
      type="button"
      onClick={press}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${subject} from your list` : `Save ${subject} to your list`}
      className={
        'relative grid shrink-0 place-items-center rounded-full ring-1 ring-inset ' +
        'transition-colors duration-200 ' +
        shell.base +
        ' ' +
        (saved ? shell.saved : shell.idle) +
        ' ' +
        className
      }
    >
      {/* The ring and the sparks leave the button, so they are drawn outside its
          own bounds and must never take a press aimed at it. */}
      {bursting ? (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span key={`ring-${beat?.n}`} className="luvo-like-ring" />
          {SPARKS.map((spark, index) => (
            <span key={`spark-${beat?.n}-${index}`} className="luvo-like-spark" style={spark} />
          ))}
        </span>
      ) : null}

      <span
        key={beat ? `icon-${beat.n}` : 'icon'}
        className={
          `relative block ${shell.icon} ` +
          (beat ? (beat.saving ? 'luvo-like-pop' : 'luvo-like-drop') : '')
        }
      >
        {/* The outline is always drawn. The fill is a second copy over it, so
            saving is a heart being filled in rather than one icon swapped for
            another — and so the sweep has something to clip. */}
        <Heart className="absolute inset-0 h-full w-full" />
        {saved ? (
          <Heart
            filled
            className={`absolute inset-0 h-full w-full ${bursting ? 'luvo-like-fill' : ''}`}
          />
        ) : null}
      </span>
    </button>
  );
}

function Heart({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.2a4.4 4.4 0 0 1 7.5 2.7c0 4.9-7.5 9.6-7.5 9.6Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
