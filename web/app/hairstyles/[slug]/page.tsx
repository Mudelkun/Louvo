import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '../../../components/seo/Breadcrumbs';
import { CollectionGrid, CollectionLinks } from '../../../components/seo/CollectionGrid';
import { JsonLd } from '../../../components/seo/JsonLd';
import { ButtonLink, Rule, Section } from '../../../components/ui';
import { loadCatalog } from '../../../lib/catalogServer';
import { allCollections, parseCollection, stylesIn, type Collection } from '../../../lib/collections';
import { DEFAULT_HAIR_COLOR_ID } from '../../../lib/colorGrade';
import { abs, breadcrumbLd, graph, itemListLd, og, ORG_ID, SITE_ID, tw } from '../../../lib/seo';

/**
 * One collection: a gender, a texture or a category, on its own url.
 *
 * The argument for this route is in `lib/collections.ts` and it is short — there
 * is a whole band of demand between the brand and an individual haircut ("men's
 * hairstyles", "curly hairstyles", "fade haircuts") and the site had nothing in
 * it, because the only thing that narrowed the catalogue was React state on
 * `/styles`. These are the urls for that band, and every one of them is composed
 * from catalog data, so a published category creates its pages rather than
 * needing a release.
 *
 * ## It renders on the server, which is the whole point
 *
 * `/styles` is a client component reading a context, so the html it serves is a
 * skeleton and its links to fifty-odd hairstyles exist only after hydration.
 * Google does render JavaScript, on a later pass, from a queue it prioritises by
 * how much it already trusts a domain — which is precisely the wrong deal for a
 * new one. Everything below is html: the heading, the intro, the grid, the
 * links out. Nothing was taken away from the browser; `<StyleCard>` still
 * hydrates and still cycles.
 *
 * ## Static, and revalidated
 *
 * `generateStaticParams` enumerates the collections the catalogue can actually
 * fill, so these are built once and served from the edge. `revalidate` is the
 * hour `loadCatalog()` uses — the same trade the sitemap makes, for the same
 * reason: a publish is rare and never urgent.
 */
export const revalidate = 3600;

/**
 * Unknown slugs are rendered on demand and 404 there, rather than being refused
 * at the edge.
 *
 * `dynamicParams = false` was the first instinct and is the wrong trade. The set
 * is enumerable, so refusing anything outside it looks free — until the build
 * runs while the API is having a bad minute, `generateStaticParams` answers with
 * an empty list, and every collection link in the footer of every page 404s
 * until somebody notices and redeploys. Leaving it dynamic costs one render for
 * a url nobody asked for, and `resolve()` returning null is still a real 404: a
 * made-up facet never renders a confident heading over an empty grid, which is
 * the failure that actually matters.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  const catalog = await loadCatalog();
  if (!catalog) return [];
  return allCollections(catalog.hairstyles, catalog).map((collection) => ({
    slug: collection.slug,
  }));
}

async function resolve(slug: string): Promise<{ collection: Collection; catalog: NonNullable<Awaited<ReturnType<typeof loadCatalog>>> } | null> {
  const catalog = await loadCatalog();
  if (!catalog) return null;
  const collection = parseCollection(slug, catalog);
  if (!collection) return null;
  return { collection, catalog };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolve(slug);
  if (!resolved) return { title: 'Hairstyles' };

  const { collection } = resolved;
  return {
    title: collection.title,
    description: collection.description,
    alternates: { canonical: `/hairstyles/${collection.slug}` },
    openGraph: og({
      path: `/hairstyles/${collection.slug}`,
      title: collection.title,
      description: collection.description,
    }),
    twitter: tw({ title: collection.title, description: collection.description }),
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolve(slug);
  if (!resolved) notFound();

  const { collection, catalog } = resolved;
  const styles = stylesIn(catalog.hairstyles, collection);
  const color = catalog.colors.find((entry) => entry.id === DEFAULT_HAIR_COLOR_ID) ?? null;

  const trail = [
    { name: 'Home', path: '/' },
    { name: 'Hairstyles', path: '/hairstyles' },
    { name: collection.heading, path: `/hairstyles/${collection.slug}` },
  ];

  /**
   * The siblings, split into the two shelves somebody would plausibly want next.
   *
   * Not "every other collection", which on a catalogue this size is forty links
   * under a grid and reads as a footer nobody wrote. A page about a texture
   * offers the other textures; a page about a category offers the other
   * categories; and both offer the same collection under the other gender, which
   * is the single most common next question.
   */
  const siblings = allCollections(catalog.hairstyles, catalog).filter(
    (entry) => entry.slug !== collection.slug,
  );

  const sameShape = siblings.filter((entry) =>
    collection.hairType
      ? !!entry.hairType && entry.gender === collection.gender
      : collection.categoryId
        ? !!entry.categoryId && entry.gender === collection.gender
        : !entry.hairType && !entry.categoryId,
  );

  const otherGender = siblings.filter(
    (entry) =>
      entry.gender !== collection.gender &&
      entry.hairType === collection.hairType &&
      entry.categoryId === collection.categoryId,
  );

  return (
    <Section className="pb-24 pt-6 sm:pt-10">
      <JsonLd
        data={graph(
          {
            '@type': 'CollectionPage',
            '@id': abs(`/hairstyles/${collection.slug}#page`),
            url: abs(`/hairstyles/${collection.slug}`),
            name: collection.heading,
            description: collection.description,
            isPartOf: { '@id': SITE_ID },
            publisher: { '@id': ORG_ID },
            inLanguage: 'en',
          },
          breadcrumbLd(trail),
          itemListLd(styles, collection.heading),
        )}
      />

      <Breadcrumbs trail={trail} className="mb-6" />

      <header className="max-w-[62ch]">
        <h1 className="font-display text-[clamp(2.1rem,5vw,3.1rem)] leading-[1.03] tracking-[-0.02em]">
          {collection.heading}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{collection.intro}</p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <ButtonLink href="/">Try one on your photo</ButtonLink>
          <span className="text-[13px] text-muted">
            {styles.length} {styles.length === 1 ? 'cut' : 'cuts'} · two free previews, no card
          </span>
        </div>
      </header>

      <div className="mt-10 sm:mt-12">
        <CollectionGrid
          styles={styles}
          hairTypes={catalog.hairTypes}
          manifest={catalog.renders}
          gender={collection.gender}
          hairType={collection.hairType}
          color={color}
        />
      </div>

      <Rule className="mt-14" />

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <CollectionLinks heading="Keep looking" links={sameShape.slice(0, 12)} />
        <CollectionLinks heading="The other shelf" links={otherGender.slice(0, 4)} />
      </div>

      <p className="mt-10 text-[13.5px] text-muted">
        Or{' '}
        <Link
          href="/styles"
          className="font-semibold text-violet-ink underline underline-offset-4"
        >
          browse the whole catalogue
        </Link>{' '}
        with the filters open.
      </p>
    </Section>
  );
}
