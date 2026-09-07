'use client';

/**
 * One hairstyle in the catalog grid.
 *
 * The plate is the card. Everything else — the name, the upkeep, the types this
 * render stands for — sits under it on the scheme's own surface, so the render's
 * white edge never meets a dark ground and the seam that would draw disappears.
 *
 * Under *All Types* the plate cross-fades through every render the cut actually
 * has, on the beat every other card is using (`useVariantCycle`). The caption
 * says which types the render on screen stands for, so the matrix is visible
 * from the grid rather than only from inside a style page. With a hair type
 * declared there is one render and nothing moves.
 *
 * The heart sits on the plate rather than only on the style page: deciding you
 * like a haircut is something that happens while scrolling a grid, and a save
 * that costs a page load and a page back is one most people do not make. It is
 * a sibling of the link and never a child of it — a button inside an anchor is
 * invalid, and the browser's answer to a click on it would be a navigation. The
 * lift on hover therefore belongs to the wrapper, so the card and its heart move
 * as one thing.
 */

import Link from 'next/link';
import { useMemo } from 'react';

import { useVariantCycle } from '../lib/useVariantCycle';
import type { HairColor, HairType, HairTypeId, Hairstyle, RenderManifest } from '../lib/contract/catalog';
import { textureFor, typesForVariant, variantCandidates } from '../lib/hairTypes';
import { HERO_ANGLE, renderedVariants, resolveRender } from '../lib/renders';
import { FavouriteButton } from './FavouriteButton';
import { Plate } from './Plate';
import { Skeleton } from './ui';

export interface StyleCardProps {
  style: Hairstyle;
  /** The catalogue's hair types, so the caption can name one rather than number it. */
  hairTypes: HairType[];
  manifest: RenderManifest;
  gender: Hairstyle['genders'][number] | null;
  hairType: HairTypeId | null;
  color: HairColor | null;
  /** Carried into the style page so it opens on the view the grid was showing. */
  query?: string;
  /**
   * Whether the card carries a heart.
   *
   * On for the catalogue, where somebody is choosing; off for the suggestion
   * shelf, which draws the same cut up to three times at once — two breakpoints
   * and the copy that makes its row drift — and would be three hearts for one
   * decision, one of them inside an `aria-hidden` subtree.
   */
  saveable?: boolean;
  priority?: boolean;
  /**
   * `-1` for a card that is drawn but must not be reachable.
   *
   * The duplicated copy in a drifting row is the only caller: it is the same
   * four cuts a few seconds later, so it is furniture — visible, and out of the
   * tab order.
   */
  tabIndex?: number;
}

export function StyleCard({
  style,
  hairTypes,
  manifest,
  gender,
  hairType,
  color,
  query,
  saveable,
  priority,
  tabIndex,
}: StyleCardProps) {
  const candidates = useMemo(() => variantCandidates(style, hairType), [style, hairType]);

  /**
   * The renders worth cycling through — existing, and *different*.
   *
   * Deduped by url, since two candidates resolving to one file would read as a
   * stutter rather than as a second version of the cut.
   */
  const renders = useMemo(
    () => renderedVariants(manifest, { styleId: style.id, gender, angle: HERO_ANGLE, variants: candidates }),
    [manifest, style.id, gender, candidates],
  );

  const index = useVariantCycle(renders.length);
  const current = renders[index] ?? resolveRender(manifest, {
    styleId: style.id,
    gender,
    angle: HERO_ANGLE,
    variants: candidates,
  });

  const texture = textureFor(style, hairType);
  const shownTypes = current ? typesForVariant(style, current.variant) : [];

  /**
   * A hair type, in words.
   *
   * "Type 3" is a number, not an answer — it means something only to somebody
   * who has already read the chart. The catalogue's own `name` is what the setup
   * dialogue and the style page say, so the caption on a cycling card says it
   * too. Empty while the catalogue is in flight, which for a card already
   * drawing a render cannot happen.
   */
  const label = (type: HairTypeId | undefined) =>
    (type ? hairTypes.find((row) => row.id === type)?.name : null) ?? '';

  return (
    <div
      className={
        'group/card relative transition-transform duration-500 ' +
        '[transition-timing-function:var(--ease-out-quint)] hover:-translate-y-1'
      }
    >
      <Link
        href={`/styles/${style.id}${query ? `?${query}` : ''}`}
        tabIndex={tabIndex}
        className="group/link block focus-visible:outline-none"
      >
        <article
          className={
            'overflow-hidden rounded-[20px] bg-surface/60 ring-1 ring-inset ring-line ' +
            'transition-[box-shadow,background-color] duration-500 ' +
            '[transition-timing-function:var(--ease-out-quint)] ' +
            'group-hover/card:bg-surface group-hover/card:ring-white/18 ' +
            'group-hover/card:shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9)] ' +
            'group-focus-visible/link:ring-2 group-focus-visible/link:ring-violet'
          }
        >
          <div className="relative aspect-[4/5] w-full bg-plate">
            {/* Every render is stacked and cross-faded rather than swapped, so a
                change of texture is a dissolve and not a blank frame. */}
            {renders.length > 1 ? (
              renders.map((entry, position) => (
                <div
                  key={entry.ref.url}
                  className="absolute inset-0 transition-opacity duration-[900ms] ease-in-out"
                  style={{ opacity: position === index ? 1 : 0 }}
                >
                  <Plate
                    render={entry}
                    shape={style.shape}
                    texture={texture}
                    color={color}
                    gender={gender}
                    angle={HERO_ANGLE}
                    alt={`${style.name}, ${label(typesForVariant(style, entry.variant)[0])}`}
                    priority={priority && position === 0}
                    className="h-full w-full"
                  />
                </div>
              ))
            ) : (
              <Plate
                render={current}
                shape={style.shape}
                texture={texture}
                color={color}
                gender={gender}
                angle={HERO_ANGLE}
                alt={style.name}
                priority={priority}
                className="h-full w-full"
              />
            )}

            {/*
              The type caption, on the plate, in plate ink — see `<Plate>`.

              It is the whole reason the cycle is legible rather than mysterious: a
              plate that changes every four seconds with nothing naming what
              changed reads as a page fault. The caption says which textures the
              render on screen stands for, so the cross-fade is visibly the
              catalogue showing the cut's other versions.

              Ringed, because `bg-white/85` on a plate that is *itself* white is a
              chip with no edges — the words floated on the mannequin's shoulder
              and the pill they were supposed to sit in was invisible. The ring is
              plate ink at low alpha, so it draws the chip without darkening it.
            */}
            {shownTypes.length && renders.length > 1 ? (
              <span
                className={
                  'absolute bottom-3 left-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold ' +
                  'uppercase tracking-[0.1em] text-on-plate-ink ring-1 ring-inset ring-on-plate/20 ' +
                  'backdrop-blur-sm'
                }
              >
                {shownTypes.map(label).join(' · ')}
              </span>
            ) : null}

            {!current ? (
              <span
                className={
                  'absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold ' +
                  'uppercase tracking-[0.1em] text-on-plate-muted'
                }
              >
                Illustrated
              </span>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <h3 className="truncate font-display text-[19px] leading-snug text-ink">{style.name}</h3>
              <p className="mt-0.5 truncate text-[12px] text-muted">
                {style.maintenance} upkeep
                {style.tags[0] ? ` · ${style.tags[0]}` : ''}
              </p>
            </div>
            <span
              aria-hidden
              className={
                'mt-1 shrink-0 text-muted transition-[transform,color] duration-300 ' +
                'group-hover/card:translate-x-0.5 group-hover/card:text-violet-ink'
              }
            >
              →
            </span>
          </div>
        </article>
      </Link>

      {/* Outside the anchor, over the plate's top-right corner — which is why
          the "Illustrated" badge sits on the left. Always drawn rather than
          revealed on hover: a control that appears on a pointer is a control a
          phone does not have. */}
      {saveable ? (
        <FavouriteButton
          styleId={style.id}
          styleName={style.name}
          variant="plate"
          className="absolute right-2.5 top-2.5 z-10"
        />
      ) : null}
    </div>
  );
}

/**
 * The card's placeholder, beside the card so a change to one is a change to the
 * other.
 *
 * It states the layout — a plate at 4:5, a title, a meta line — and nothing
 * about the data, because how many styles came back is not known yet.
 */
export function StyleCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[20px] bg-surface/60 ring-1 ring-inset ring-line">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <div className="px-4 py-3.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}
