'use client';

/**
 * More haircuts, offered as a next step.
 *
 * One component for the two places that make that offer — under a finished
 * preview, and under a cut in the catalogue — because they are one thing said
 * twice. Two copies of a heading, a rail, a skeleton and a marquee is two
 * chances for the two surfaces to suggest the same haircuts in visibly
 * different ways, which reads as two unrelated features rather than as the
 * catalogue's own "and then?".
 *
 * What each surface owns is the *frame* around it: the preview page puts it in
 * the right-hand column and orders it against the picture, the style page rules
 * it off below the fold. Everything inside is here.
 *
 * ## It drifts at every width, left to right
 *
 * It was a static four-card grid from `sm` and a drifting row only below it, on
 * the argument that four cards a laptop can already see whole have nothing to
 * gain from moving. That was true about the *cards* and wrong about the
 * *catalogue*: four is a sample, and a row of exactly four reads as the four
 * this page has rather than as the shelf it is standing on — the same mistake
 * the front page's twelve stationary plates made before they became the whole
 * catalogue, moving. So it is one rail now, at every width, showing ten and
 * always with one more arriving, and it drifts the way the front page's women's
 * shelf does: left to right, the same keyframes run backwards.
 *
 * A grid is also what made this page tall. Four cards across the foot of a
 * laptop is a row as deep as a card, under a plate as tall as the column; the
 * rail is the same height and does not have to be reached by scrolling past the
 * picture, which is what the plate's own height cap on that page is for.
 *
 * It stops the instant a finger or a cursor is on it (`.marquee` in
 * `globals.css`): every card is a link, and a link that moves out from under the
 * pointer is a link nobody can follow. Reduced motion gets a still, scrollable
 * row rather than a paused one — a paused marquee is a rail nobody can reach the
 * end of.
 */

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import type {
  Gender,
  HairColor,
  HairType,
  HairTypeId,
  Hairstyle,
  RenderManifest,
} from '../lib/contract/catalog';
import { useOnScreen } from '../lib/useOnScreen';
import { useReducedMotion } from '../lib/useReducedMotion';
import { StyleCard, StyleCardSkeleton } from './StyleCard';

/**
 * How long one card takes to cross its own width in the drifting row.
 *
 * The duration is this times the number of cards, so a row of four and a row of
 * eight travel at the same rate rather than the long one racing — the same rule
 * the front page's shelves are paced by.
 */
const SECONDS_PER_CARD = 3.2;

/**
 * Below this the row is repeated until it fills the rail.
 *
 * The track is two copies travelling half its own width, so one copy has to be
 * at least as wide as the rail or the loop point leaves a hole and the row reads
 * as having run out. Eight cards at 180px clear the widest the site ever draws
 * one (the style page's 1216px container); `SUGGESTION_COUNT` normally supplies
 * more than that, so this bites only for the cut whose catalogue neighbours have
 * been retired.
 */
const MIN_CARDS = 8;

/** How many cards the placeholder draws — a fact about the row, not about the data. */
const PLACEHOLDERS = 8;

/**
 * How many cuts each surface asks for.
 *
 * The shelf's own number rather than each page's, because it is a fact about the
 * rail: four filled a grid and visibly repeats in a drifting one, where a laptop
 * has six on screen at once. Ten is enough that the row is a catalogue rather
 * than a loop, and the repetition below `MIN_CARDS` is there for the cut whose
 * neighbours have been retired.
 */
export const SUGGESTION_COUNT = 10;

/** One card's width, which sets how many are on screen and how fast they cross it. */
const CARD_WIDTH = 'w-[150px] sm:w-[168px] lg:w-[180px]';

/**
 * The gutter bleed is the phone's and only the phone's.
 *
 * On a phone the rail runs to both edges of the screen, so it has to escape the
 * page's own 20px padding. From `sm` it does not: the preview page draws it
 * inside a 430px column, and a rail bleeding out of that column would run under
 * the picture beside it.
 */
const BLEED = '-mx-5 px-5 sm:mx-0 sm:px-0';

export interface SuggestionShelfProps {
  /** The heading. Each surface names the offer in its own words. */
  title: string;
  /**
   * One sentence under it, or nothing.
   *
   * Optional because the two surfaces are not in the same position to say
   * anything true here: after a preview, what the next one costs the visitor is
   * worth stating, and on a style page the button above it has already said so.
   */
  note?: ReactNode;
  styles: Hairstyle[];
  hairTypes: HairType[];
  /** Null while the catalogue is in flight — see `loading`. */
  manifest: RenderManifest | null;
  gender: Gender | null;
  hairType: HairTypeId | null;
  color: HairColor | null;
  /** Carried into every card and into "All cuts", so nothing loses the answers. */
  query?: string;
  /** Placeholders instead of cards, for a surface drawn before its catalogue lands. */
  loading?: boolean;
  /** The frame's own classes: order, spacing, whatever the page around it needs. */
  className?: string;
}

export function SuggestionShelf({
  title,
  note,
  styles,
  hairTypes,
  manifest,
  gender,
  hairType,
  color,
  query,
  loading,
  className,
}: SuggestionShelfProps) {
  /** The suggestions, repeated until they fill a phone's width — see `MIN_CARDS`. */
  const shelf = useMemo(() => {
    if (styles.length === 0) return [];
    const filled = [...styles];
    while (filled.length < MIN_CARDS) filled.push(...styles);
    return filled;
  }, [styles]);

  /** Anybody who has asked for less motion gets the row still, and scrollable. */
  const still = useReducedMotion();

  /**
   * And it stops while it is scrolled away, which on the style page is most of
   * the time — the rail sits below the plate and the whole page is built so the
   * picture and its controls land on one screen. See `useOnScreen`.
   */
  const [rail, onScreen] = useOnScreen<HTMLDivElement>();

  const pending = loading || !manifest;

  if (!pending && styles.length === 0) return null;

  /**
   * One suggestion. Written once because it is drawn three times — drifting,
   * still under reduced motion, and as the second copy of the track — and three
   * copies of eight props is three chances for them to disagree.
   */
  const suggestion = (entry: Hairstyle, inert?: boolean) =>
    manifest ? (
      <StyleCard
        style={entry}
        hairTypes={hairTypes}
        manifest={manifest}
        gender={gender}
        hairType={hairType}
        color={color}
        query={query}
        tabIndex={inert ? -1 : undefined}
      />
    ) : null;

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-5">
        <h2 className="font-display text-[clamp(1.4rem,2.6vw,1.9rem)] leading-tight tracking-[-0.015em]">
          {title}
        </h2>
        <Link
          href={`/styles${query ? `?${query}` : ''}`}
          className="shrink-0 text-[13px] font-semibold text-violet-ink"
        >
          All cuts &rarr;
        </Link>
      </div>

      {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}

      {pending ? (
        // How many cards is a fact about this row; which cuts they are is not
        // known until the catalogue lands.
        <div className={`no-scrollbar mt-6 flex overflow-x-auto ${BLEED}`}>
          {Array.from({ length: PLACEHOLDERS }, (_, index) => (
            <div key={index} className={`me-3 shrink-0 ${CARD_WIDTH}`}>
              <StyleCardSkeleton />
            </div>
          ))}
        </div>
      ) : still ? (
        /* Not the marquee paused: a paused marquee is a row nobody can reach the
           end of. It becomes what it would have been if it had never moved — one
           copy of the row, scrolled by hand. */
        <div className={`no-scrollbar mt-6 flex overflow-x-auto ${BLEED}`}>
          {styles.map((entry) => (
            <div key={entry.id} className={`me-3 shrink-0 ${CARD_WIDTH}`}>
              {suggestion(entry)}
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={rail}
          data-offscreen={onScreen ? undefined : ''}
          className={`marquee mt-6 overflow-hidden ${BLEED}`}
        >
          <div
            className="marquee-track"
            /* Left to right, which is the front page's women's shelf: the same
               keyframes run backwards rather than a second animation. */
            data-direction="reverse"
            style={{ animationDuration: `${(shelf.length * SECONDS_PER_CARD).toFixed(1)}s` }}
          >
            {/* Two copies travelling half the track's own width, which lands the
                second exactly where the first started. The second is furniture:
                a screen reader and the tab order see the row once. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex" aria-hidden={copy === 1 ? true : undefined}>
                {shelf.map((entry, index) => (
                  <div
                    key={`${copy}-${index}-${entry.id}`}
                    className={`me-3 shrink-0 ${CARD_WIDTH}`}
                  >
                    {suggestion(entry, copy === 1)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
