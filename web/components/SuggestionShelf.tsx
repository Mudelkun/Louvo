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
 * ## From `sm` it is a grid; below `sm` it drifts
 *
 * From `sm` all four cards are on screen at once and a moving row would be
 * motion for its own sake. Below it they are not: four cards two-up is two rows
 * and the second is under the fold, which is where a suggestion goes unread. So
 * on a phone the row drifts. One card is always arriving, which is what makes it
 * read as a row of *more* rather than as the two the page happened to fit, and
 * it costs no height at all.
 *
 * It stops the instant a finger or a cursor is on it (`.marquee` in
 * `globals.css`): every card is a link, and a link that moves out from under the
 * pointer is a link nobody can follow. Reduced motion gets a still, scrollable
 * row rather than a paused one — a paused marquee is a rail nobody can reach the
 * end of.
 */

import Link from 'next/link';
import { Fragment, useMemo, type ReactNode } from 'react';

import type {
  Gender,
  HairColor,
  HairType,
  HairTypeId,
  Hairstyle,
  RenderManifest,
} from '../lib/contract/catalog';
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
 * Four suggestions at 150px are wider than any phone, so this almost never
 * bites; it is here for the cut whose catalogue neighbours have been retired,
 * where a track narrower than the screen would leave a hole at the loop point
 * and read as the row having run out.
 */
const MIN_CARDS = 6;

/** How many cards the placeholder draws — a fact about the row, not about the data. */
const PLACEHOLDERS = 4;

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
  /** The grid from `sm` — the one thing a column width changes. */
  gridClassName?: string;
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
  gridClassName = 'sm:grid-cols-4',
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

  const pending = loading || !manifest;

  if (!pending && styles.length === 0) return null;

  /**
   * One suggestion. Written once because it is drawn twice — as a static grid
   * from `sm`, and as a drifting row below it — and two copies of eight props is
   * two chances for the phone and the laptop to suggest different things.
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

      <div className={`mt-6 hidden grid-cols-2 gap-4 sm:grid sm:gap-5 ${gridClassName}`}>
        {pending
          ? // How many cards is a fact about this row; which cuts they are is not
            // known until the catalogue lands.
            Array.from({ length: PLACEHOLDERS }, (_, index) => <StyleCardSkeleton key={index} />)
          : styles.map((entry) => <Fragment key={entry.id}>{suggestion(entry)}</Fragment>)}
      </div>

      {pending ? (
        <div className="no-scrollbar -mx-5 mt-5 flex gap-4 overflow-x-auto px-5 sm:hidden">
          {Array.from({ length: PLACEHOLDERS }, (_, index) => (
            <div key={index} className="w-[150px] shrink-0">
              <StyleCardSkeleton />
            </div>
          ))}
        </div>
      ) : still ? (
        /* Not the marquee paused: a paused marquee is a row nobody can reach the
           end of. It becomes what it would have been if it had never moved — one
           copy of the row, scrolled by hand. */
        <div className="no-scrollbar -mx-5 mt-5 flex overflow-x-auto px-5 sm:hidden">
          {styles.map((entry) => (
            <div key={entry.id} className="me-3 w-[150px] shrink-0">
              {suggestion(entry)}
            </div>
          ))}
        </div>
      ) : (
        <div className="marquee -mx-5 mt-5 overflow-hidden px-5 sm:hidden">
          <div
            className="marquee-track"
            style={{ animationDuration: `${(shelf.length * SECONDS_PER_CARD).toFixed(1)}s` }}
          >
            {/* Two copies travelling half the track's own width, which lands the
                second exactly where the first started. The second is furniture:
                a screen reader and the tab order see the row once. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex" aria-hidden={copy === 1 ? true : undefined}>
                {shelf.map((entry, index) => (
                  <div key={`${copy}-${index}-${entry.id}`} className="me-3 w-[150px] shrink-0">
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
