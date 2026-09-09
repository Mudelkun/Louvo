'use client';

/**
 * The catalogue.
 *
 * Everything on this page is catalogue data. There is not a hairstyle name, a
 * category name or a hair type name anywhere in this file — categories come from
 * `catalog.categories`, types from `catalog.hairTypes`, and the cuts from
 * `catalog.hairstyles`. That is the constraint that makes publishing a new
 * hairstyle a `npm run catalog:publish` rather than a release, and it is worth
 * more than any layout decision here.
 *
 * ## Filtering is local, and instant
 *
 * The whole catalogue is one ~45 KB gzipped document that has already arrived,
 * so a category change is an array filter rather than a round trip. There is no
 * loading state between filters because there is nothing to load — which is also
 * why the filters are a rail that stays on screen rather than a modal that
 * commits: with no latency to hide, a modal is only friction.
 *
 * The rail itself is `<CatalogFilters>`, shared with the try-on flow's chooser,
 * so the two surfaces cannot drift into offering different controls over the
 * same data. What is local to this page is the *frame* it sits in — sticky, and
 * bled to the page's gutters — not the controls.
 *
 * ## Hair type is not a filter laid over the catalogue
 *
 * Declaring a type *removes* the cuts that are not offered for it — an afro is
 * not a type 1 haircut — and picks which render of every survivor is shown. That
 * is why the count changes when the type does, and the line under the rail says
 * so rather than leaving it to be discovered.
 */

import { useSearchParams } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';

import { filterHairstyles, type SortId } from '../lib/hairTypes';
import { useScrollMemory } from '../lib/useScrollMemory';
import { useCatalog } from '../lib/state/CatalogContext';
import { useAdoptedAnswers, useSession } from '../lib/state/SessionContext';
import { CatalogFilters } from './CatalogFilters';
import { StyleCard, StyleCardSkeleton } from './StyleCard';
import { Notice, Skeleton } from './ui';

const GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:gap-6';

export function CatalogBrowser() {
  const { catalog, categories, hairTypes, defaultColor, loading, error, reload } = useCatalog();
  const { gender, hairType, hairTypeDeclared, setGender, setHairType } = useSession();

  /**
   * Answers carried in on the url, adopted once.
   *
   * Every grid on the site already mints `?gender=…&hairType=…` into its links,
   * and a finished preview mints the answers it was generated with. Without this
   * the rail would read the stored session instead, so "all cuts" from a preview
   * of a women's coily cut could open on the men's shelf — the link would be
   * making a promise the page then quietly broke. After the first read the rail
   * owns the state, so nothing here fights a filter the visitor has just moved.
   */
  const carried = useSearchParams();
  useAdoptedAnswers({ gender: carried.get('gender'), hairType: carried.get('hairType') });

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>('popular');

  /**
   * The box is seeded from `?search=`, and that parameter has one job.
   *
   * It is the target of the `SearchAction` in the site's structured data — the
   * thing a sitelinks searchbox submits to — so it has to be a url that really
   * filters this grid. Declaring a search endpoint a site ignores is the kind of
   * markup that describes a page which does not exist.
   *
   * Seeded rather than bound: after the first render the box owns its own value,
   * so typing does not rewrite the url and the back button does not fight the
   * filter. It is the same "adopt once" rule the two answers above follow, for
   * the same reason.
   */
  const [search, setSearch] = useState(() => carried.get('search') ?? '');

  /**
   * The grid lags the search box by a frame, and the box never lags the typist.
   *
   * Typing is the one interaction here that changes the result set on every
   * keystroke: `filterHairstyles` re-runs and hands the grid a new array, which
   * before `<StyleCard>` was memoised meant re-rendering fifty-six cards and a
   * hundred and twenty plates per character. Memoising the card fixed most of
   * that, but the cards that genuinely enter and leave the result still have to
   * mount and unmount, and on a mid-range phone that is enough to drop
   * characters.
   *
   * `useDeferredValue` splits the two: `search` drives the input, so what
   * somebody typed appears immediately, and the deferred copy drives the filter,
   * so the grid is rebuilt at a lower priority and React abandons a half-done
   * pass when the next keystroke arrives. Nothing is debounced — there is no
   * fixed delay to tune and no window where the grid is stale on a settled
   * input; the deferred value catches up as soon as there is a frame to do it
   * in.
   *
   * Only the search is deferred. A category or a texture is one deliberate press
   * with no follow-up keystroke to yield to, and deferring it would be latency
   * bought for nothing.
   */
  const typed = useDeferredValue(search);

  const results = useMemo(
    () =>
      catalog
        ? filterHairstyles(catalog.hairstyles, { gender, hairType, categoryId, sort, search: typed })
        : [],
    [catalog, gender, hairType, categoryId, sort, typed],
  );

  /**
   * Where this grid was left, so the back arrow on a style page comes back to
   * it rather than to the top of the catalogue.
   *
   * The signature is *what the grid was showing*, not merely which page it was:
   * the answers, the category, the sort, the search and how many cuts survived
   * them. An offset taken on one result set means nothing on another, so a
   * changed filter discards it and the catalogue opens at the top, which is the
   * honest answer to a different list of haircuts. `useScrollMemory` has the
   * rest of the argument.
   */
  useScrollMemory(
    'styles',
    `${gender ?? ''}|${hairType ?? ''}|${categoryId ?? ''}|${sort}|${typed}|${results.length}`,
    !loading && Boolean(catalog),
  );

  // Carried into every style page so it opens on the view the grid was showing.
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
      {/* -------------------------------------------------------------- */}
      {/* The rail                                                        */}
      {/* -------------------------------------------------------------- */}
      {/* One row now, so it is pinned at every size — a rail that costs 44
          points of a phone screen is worth keeping under the thumb, where the
          four bands it replaced were not. */}
      <div className="sticky top-[68px] z-30 -mx-5 mb-8 bg-canvas/85 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
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
      </div>

      {/* -------------------------------------------------------------- */}
      {/* The count                                                       */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 flex items-baseline gap-3">
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

      {/* -------------------------------------------------------------- */}
      {/* The grid                                                        */}
      {/* -------------------------------------------------------------- */}
      {loading ? (
        <div className={GRID}>
          {Array.from({ length: 8 }, (_, index) => (
            <StyleCardSkeleton key={index} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <Notice
          title="Nothing matches that yet"
          body={
            search
              ? `No cut in the catalogue is called anything like “${search}”. Try a shorter word, or clear the filters.`
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
          {results.map((style, index) => (
            <StyleCard
              key={style.id}
              style={style}
              hairTypes={hairTypes}
              manifest={catalog!.renders}
              gender={gender}
              hairType={hairType}
              color={defaultColor}
              query={query}
              saveable
              priority={index < 4}
            />
          ))}
        </div>
      )}
    </>
  );
}
