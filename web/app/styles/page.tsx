import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Breadcrumbs } from '../../components/seo/Breadcrumbs';
import { JsonLd } from '../../components/seo/JsonLd';
import { CatalogBrowser } from '../../components/CatalogBrowser';
import { StyleCardSkeleton } from '../../components/StyleCard';
import { ButtonLink, Rule, Section, Skeleton } from '../../components/ui';
import { loadCatalog } from '../../lib/catalogServer';
import { abs, breadcrumbLd, graph, itemListLd, og, ORG_ID, SITE_ID, tw } from '../../lib/seo';

const TITLE = 'The hairstyle catalogue — every cut, on four textures';
const DESCRIPTION =
  'Every cut Luvo can put on you, shot the same way: one neutral mannequin, one light, four ' +
  'angles. Filter by texture, length and upkeep — then try one on your own photo.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  /**
   * The bare path, and the filters keep working.
   *
   * This page is reached with `?gender=`, `?hairType=` and `?search=` on it —
   * answers carried in from a card, from a finished preview, or from the
   * sitelinks searchbox. Every one of those is the same catalogue in a different
   * arrangement, so they canonicalise here rather than competing with each
   * other and with this page for one query. The urls that deserve to be indexed
   * *as* a narrowed catalogue are the collections under `/hairstyles`, which
   * have their own headings and their own copy.
   */
  alternates: { canonical: '/styles' },
  openGraph: og({ path: '/styles', title: TITLE, description: DESCRIPTION }),
  twitter: tw({ title: TITLE, description: DESCRIPTION }),
};

const TRAIL = [
  { name: 'Home', path: '/' },
  { name: 'Hairstyles', path: '/hairstyles' },
  { name: 'The catalogue', path: '/styles' },
];

export default async function StylesPage() {
  /**
   * Fetched here purely so the document is not empty.
   *
   * `<CatalogBrowser>` is the page and it is a client component — the grid, the
   * rail and every link to a hairstyle appear after hydration. That is the right
   * design for the interaction and it means the html served here has no link to
   * any cut in it, which for the site's most linked-to page is the whole
   * catalogue hidden behind a render pass we do not control the timing of. The
   * `ItemList` below and the index at the foot of the page are the answer: the
   * names and the urls are in the document, and the interactive grid is
   * unchanged above them.
   */
  const catalog = await loadCatalog();
  const styles = catalog ? [...catalog.hairstyles].sort((a, b) => b.popularity - a.popularity) : [];

  return (
    <Section className="pb-24 pt-6 sm:pt-12">
      <JsonLd
        data={graph(
          {
            '@type': 'CollectionPage',
            '@id': abs('/styles#page'),
            url: abs('/styles'),
            name: 'The hairstyle catalogue',
            description: DESCRIPTION,
            isPartOf: { '@id': SITE_ID },
            publisher: { '@id': ORG_ID },
            inLanguage: 'en',
          },
          breadcrumbLd(TRAIL),
          styles.length ? itemListLd(styles, 'The Luvo hairstyle catalogue') : null,
        )}
      />

      <Breadcrumbs trail={TRAIL} className="mb-5" />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[54ch]">
          <h1 className="font-display text-[clamp(2rem,4.6vw,2.9rem)] leading-[1.04] tracking-[-0.02em]">
            The catalogue
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            Every cut Luvo can put on you, shot the same way — one neutral mannequin, one light,
            four angles — and rendered for straight, wavy, curly and coily hair rather than for
            one of them.
          </p>
        </div>
        <ButtonLink href="/" size="sm">
          Try one on
        </ButtonLink>
      </header>

      {/* The browser reads `?gender=`, `?hairType=` and `?search=` off the url —
          the answers a grid or a finished preview minted into the link that got
          here, or a query from the sitelinks searchbox — which forces the tree
          under it out of the static render. This is what is served until the
          client picks it up: the rail, a count and eight cards, all facts about
          the layout and none about the catalogue. */}
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogBrowser />
      </Suspense>

      {/* ---------------------------------------------------------------- */}
      {/* The same catalogue, as text                                       */}
      {/* ---------------------------------------------------------------- */}
      {/*
        Not a duplicate of the grid above — a *fallback* for the two readers the
        grid does not serve. A crawler on its first pass, which is html only, and
        anybody whose JavaScript did not arrive: both get a complete, ordered,
        linked catalogue instead of an empty page. It sits under the grid, in
        small type, which is where an index belongs, and the order is popularity
        so the list agrees with what the grid opens on rather than offering a
        second, contradictory ranking.
      */}
      {styles.length ? (
        <>
          <Rule className="mt-16" />
          <section className="mt-8">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">
              Every cut in the catalogue
            </h2>
            <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {styles.map((style) => (
                <li key={style.id}>
                  <Link
                    href={`/styles/${style.id}`}
                    className="text-[13.5px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
                  >
                    {style.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] text-faint">
              Or browse by{' '}
              <Link href="/hairstyles" className="underline underline-offset-4 hover:text-ink-soft">
                texture, length and gender
              </Link>
              .
            </p>
          </section>
        </>
      ) : null}
    </Section>
  );
}

function CatalogSkeleton() {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-[210px] rounded-full" />
        <Skeleton className="h-9 w-[260px] rounded-full" />
        <Skeleton className="h-9 w-[150px] rounded-full" />
      </div>
      <Skeleton className="mb-6 h-4 w-28" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:gap-6">
        {Array.from({ length: 8 }, (_, index) => (
          <StyleCardSkeleton key={index} />
        ))}
      </div>
    </>
  );
}
