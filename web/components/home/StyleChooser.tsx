'use client';

/**
 * The catalogue, at the end of the flow, with one job: get to a cut.
 *
 * ## It carries the whole rail, and it used to carry half of it
 *
 * This was deliberately not the browse surface: gender and texture were
 * answered two questions ago, so re-offering them here as filters would ask the
 * same thing twice and invite somebody to contradict the answer they just gave.
 * What was left was categories and a search.
 *
 * The half of that which was wrong: the answers *narrow the catalogue*, and a
 * visitor who wanted to see what else exists — the women's shelf, the coily
 * shelf, every cut regardless — had to go back through a dialogue to find the
 * control. Asking twice was never the failure. Answering on somebody's behalf
 * and then hiding the switch is. So the rail is `<CatalogFilters>`, the same one
 * `/styles` uses, arriving *pre-set to the answers already given* rather than
 * empty — which is the difference between a filter and a question, and why the
 * dialogue is still worth having in front of it.
 *
 * The controls write straight to the session, so the summary row above this and
 * every style page opened from it move with them.
 *
 * ## A card is a link, and generating happens on the style page
 *
 * It was a *selection* first — tap a card, a bar slides up, generate from the
 * grid — and that was wrong for one concrete reason: **a haircut has a length**.
 * A minority of cuts are offered at two or three (`lengths` on the hairstyle),
 * and the control for that is on the style page along with the four angles and
 * the texture chooser. Generating straight off a grid card silently sends the
 * anchor length every time, so a cut somebody could have had short or long went
 * out at its usual length with nothing on screen having mentioned it.
 *
 * There is a second reason worth almost as much: the grid shows one
 * three-quarter render, and *what does the back look like* is a real question
 * about a haircut. So the card leads to the page that answers it, and **Generate
 * my preview** lives there — after the length, after the angles, after the
 * texture — which is also where somebody arriving from a search result or a
 * shared link finds it.
 *
 * ## The heart is a sibling of the link, never a child of it
 *
 * A button inside an anchor is invalid markup and the browser's answer to a
 * click on it is a navigation, so the card is a wrapper holding the link and the
 * heart side by side. The lift stays on the plate — the caption under it is not
 * part of the object that rises — and the heart repeats it so the two do not
 * come apart under a pointer.
 *
 * Nothing in this file names a hairstyle, a category or a hair type. Categories
 * come from `catalog.categories` and the cuts from `filterHairstyles`, which is
 * the constraint that keeps publishing a hairstyle a `catalog:publish` rather
 * than a release.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { Hairstyle } from '../../lib/contract/catalog';
import { displayVariants } from '../../lib/displayVariants';
import { filterHairstyles, textureFor, type SortId } from '../../lib/hairTypes';
import { HERO_ANGLE, resolveRender } from '../../lib/renders';
import { useCatalog } from '../../lib/state/CatalogContext';
import { useSession } from '../../lib/state/SessionContext';
import { CatalogFilters } from '../CatalogFilters';
import { FavouriteButton } from '../FavouriteButton';
import { Plate } from '../Plate';
import { Notice, Skeleton } from '../ui';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5';

export function StyleChooser() {
  const { catalog, categories, hairTypes, defaultColor, loading, error, reload } = useCatalog();
  const { gender, hairType, hairTypeDeclared, setGender, setHairType } = useSession();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>('popular');
  const [search, setSearch] = useState('');

  const results = useMemo(
    () =>
      catalog
        ? filterHairstyles(catalog.hairstyles, {
            gender,
            hairType,
            categoryId,
            search,
            sort,
          })
        : [],
    [catalog, gender, hairType, categoryId, search, sort],
  );

  /**
   * Carried into every style page so it opens on the view this grid is showing
   * — which now matters more than it did, since the rail can move both answers
   * after the dialogue set them.
   */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (gender) params.set('gender', gender);
    if (hairTypeDeclared) params.set('hairType', hairType ?? 'all');
    return params.toString();
  }, [gender, hairType, hairTypeDeclared]);

  if (error && !catalog) {
    return (
      <Notice
        tone="error"
        title="The catalogue could not be reached"
        body={error.message}
        action={
          <button
            type="button"
            onClick={reload}
            className="rounded-full bg-violet px-5 py-2.5 text-[13px] font-semibold text-on-violet"
          >
            Try again
          </button>
        }
      />
    );
  }

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* The rail                                                          */}
      {/* ---------------------------------------------------------------- */}
      <CatalogFilters
        categories={categories}
        hairTypes={hairTypes}
        gender={gender}
        hairType={hairType}
        hairTypeDeclared={hairTypeDeclared}
        categoryId={categoryId}
        sort={sort}
        search={search}
        onGender={setGender}
        onHairType={setHairType}
        onCategory={setCategoryId}
        onSort={setSort}
        onSearch={setSearch}
      />

      {/* ---------------------------------------------------------------- */}
      {/* The count. A placeholder states the layout, never the data.       */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-5">
        {loading ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <p className="text-[13px] text-muted">
            <span className="tnum font-semibold text-ink">{results.length}</span>{' '}
            {results.length === 1 ? 'cut' : 'cuts'}
            {hairType ? ' offered for this texture' : ''}
          </p>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The grid                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4">
        {loading ? (
          <div className={GRID}>
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index}>
                <Skeleton className="aspect-[4/5] w-full rounded-[16px]" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <Notice
            title="Nothing matches that yet"
            body={
              search
                ? 'No cut in the catalogue is called anything like that. Try a shorter word, or clear the search.'
                : 'Try a different texture or category — a cut that is not offered for a texture is left out rather than shown wrong.'
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategoryId(null);
                  setHairType(null);
                }}
                className="rounded-full bg-white/8 px-5 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-inset ring-line-strong"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className={GRID}>
            {results.map((style, index) => {
              // A stand-in render of the same cut rather than the procedural
              // drawing when the declared texture has not been shot — see
              // `displayVariants`.
              const render = resolveRender(catalog!.renders, {
                styleId: style.id,
                gender,
                angle: HERO_ANGLE,
                variants: displayVariants(catalog!.renders, style, hairType, { gender }).variants,
              });
              return (
                <div key={style.id} className="group/card relative">
                  <Link
                    href={`/styles/${style.id}${query ? `?${query}` : ''}`}
                    className="group/link block focus-visible:outline-none"
                  >
                    <div
                      className={
                        'overflow-hidden rounded-[16px] bg-plate ring-1 ring-inset ring-line ' +
                        'transition-[transform,box-shadow] duration-500 ' +
                        '[transition-timing-function:var(--ease-out-quint)] ' +
                        'group-hover/card:-translate-y-1.5 group-hover/card:ring-white/25 ' +
                        'group-hover/card:shadow-[0_22px_50px_-26px_rgb(0_0_0/0.9)] ' +
                        'group-focus-visible/link:ring-2 group-focus-visible/link:ring-violet'
                      }
                    >
                      <Plate
                        render={render}
                        shape={style.shape}
                        texture={textureFor(style, hairType)}
                        color={defaultColor}
                        gender={gender}
                        angle={HERO_ANGLE}
                        alt={style.name}
                        priority={index < 5}
                        className="aspect-[4/5] w-full"
                      />
                    </div>
                    <p className="mt-2 truncate font-display text-[16px] leading-snug text-ink transition-colors group-hover/card:text-violet-ink">
                      {style.name}
                    </p>
                    {/* The one fact from the row that changes what happens next:
                        a cut offered at more than one length has a control on its
                        page, and this is what says so before the tap. */}
                    <p className="truncate text-[11.5px] text-muted">
                      {style.maintenance} upkeep
                      {lengthsOffered(style) ? ' · lengths' : ''}
                    </p>
                  </Link>

                  {/* The lift is repeated rather than inherited: it belongs to
                      the plate, and the heart is on the plate. It rides on a
                      wrapper rather than on the button, because the button
                      transitions its own colours and one element cannot carry
                      two `transition-property` values. */}
                  <span
                    className={
                      'absolute right-2 top-2 z-10 transition-transform duration-500 ' +
                      '[transition-timing-function:var(--ease-out-quint)] ' +
                      'group-hover/card:-translate-y-1.5'
                    }
                  >
                    <FavouriteButton styleId={style.id} styleName={style.name} variant="plate" />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Whether this cut is offered at more than one length for anybody.
 *
 * The row is per gender and most of the catalogue has none at all — a fade's
 * variable is its fade height — so this is a "there is something to adjust"
 * flag, not the offer itself. `<StyleDetail>` resolves the real one.
 */
function lengthsOffered(style: Hairstyle): boolean {
  return [style.lengths?.male, style.lengths?.female].some((ids) => (ids?.length ?? 0) > 1);
}
