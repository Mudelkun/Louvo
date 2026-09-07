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
import { useMemo, useState } from 'react';

import { filterHairstyles, type SortId } from '../lib/hairTypes';
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
  const [search, setSearch] = useState('');

  const results = useMemo(
    () =>
      catalog
        ? filterHairstyles(catalog.hairstyles, { gender, hairType, categoryId, sort, search })
        : [],
    [catalog, gender, hairType, categoryId, sort, search],
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
