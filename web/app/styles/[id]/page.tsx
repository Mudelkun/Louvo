import type { Metadata } from 'next';

import { Breadcrumbs } from '../../../components/seo/Breadcrumbs';
import { JsonLd } from '../../../components/seo/JsonLd';
import { offeredTypes, StyleAbout, styleFaq } from '../../../components/seo/StyleAbout';
import { StyleDetail } from '../../../components/StyleDetail';
import { Section } from '../../../components/ui';
import { heroRender, loadCatalog, loadStyle } from '../../../lib/catalogServer';
import {
  abs,
  breadcrumbLd,
  faqLd,
  graph,
  hairstyleLd,
  og,
  ORG_ID,
  SITE_ID,
  tw,
  styleDescription,
  styleTitle,
} from '../../../lib/seo';

/**
 * One haircut.
 *
 * This is the page the whole web build was argued for: fifty-odd named cuts,
 * each with its own url, its own studio render and its own search demand, which
 * is fifty-odd entry points a binary does not have. Three things make that true
 * rather than aspirational, and all three are here rather than in
 * `<StyleDetail>`.
 *
 * **The metadata is fetched.** A shared link has to unfurl into a chat card with
 * the cut's real name and the catalogue's own render of it — a card generated
 * from an empty client tree says "Louvo" and shows nothing. The image is
 * deliberately the *hero render*: public, CDN-hosted, identical for everybody
 * who ever shares this cut, and never a user's preview.
 *
 * **The words are rendered on the server.** `<StyleDetail>` is a client
 * component reading the catalogue from a context, so the html it serves is a
 * skeleton — no heading, no description, nothing to match a query against.
 * `<StyleAbout>` is handed the row this route already fetched and renders it
 * below the fold, so the first pass a crawler makes gets prose. Nothing above
 * the fold changed and no interactivity moved.
 *
 * **There is a canonical.** Every grid on the site mints `?gender=` and
 * `?hairType=` into its card links, the result page adds `?length=`, and a
 * purchase carries `?buy=`. All four are right for the visitor and all four
 * would otherwise turn one haircut into a dozen competing urls. The canonical is
 * the bare path; the parameters keep working exactly as they did.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadStyle(id);
  const path = `/styles/${id}`;
  if (!data) {
    return { title: 'Hairstyle', alternates: { canonical: path } };
  }

  const { hairstyle } = data;
  const image = heroRender(data.renders);
  const title = styleTitle(hairstyle);
  const description = styleDescription(hairstyle);

  /**
   * The card's picture, with its real dimensions.
   *
   * Without `width` and `height` most scrapers fall back to the small
   * `summary` card even when `summary_large_image` is asked for, because they
   * will not fetch and measure an image before rendering. The alt text names
   * the cut rather than describing the frame: it is read aloud on a timeline
   * and indexed by image search, and "Louvo render" is neither.
   */
  const images = image
    ? [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          alt: `${hairstyle.name} — studio render of the haircut`,
        },
      ]
    : [];

  return {
    title,
    description,
    keywords: [hairstyle.name, ...hairstyle.tags, `${hairstyle.name} haircut`],
    alternates: { canonical: path },
    openGraph: og({
      type: 'article',
      path,
      title: `${hairstyle.name} · Louvo`,
      description,
      images,
    }),
    twitter: tw({ title: `${hairstyle.name} · Louvo`, description, images }),
  };
}

/**
 * The four answers are read here rather than with `useSearchParams` inside the
 * component.
 *
 * `length` closes the one round trip the try-on has: a style page with no
 * photograph sends somebody to `/?style=…&length=…`, and when the flow is done
 * it sends them back here — so the length they had chosen has to survive.
 *
 * `gender` and `hairType` are what every grid on the site mints into its card
 * links, and what the result page mints into the link back to the cut it just
 * put on somebody. They are the answers the *picture they clicked* was drawn
 * with, so this page has to open on them rather than on whatever is stored — a
 * card showing one texture that opens a page showing another is the wrong-image
 * failure the variant system exists to prevent. `StyleDetail` adopts them into
 * the session once, through `useAdoptedAnswers`.
 *
 * `buy` is the fourth and is not about the picture at all: it is a pack somebody
 * pressed Buy on here while signed out, carried through `/sign-in` and back. The
 * packs on this page live inside `<TopUpDialog>`, closed on the way back in, so
 * `<Pricing>` — the one thing that knows how to resume a purchase — would never
 * be mounted to notice. Handing it down reopens the dialogue over the cut the
 * visitor was standing on.
 *
 * A server component is already handed its search params, which costs no hook,
 * no Suspense boundary and no second render.
 */
const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

export default async function StylePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { length, gender, hairType, buy } = await searchParams;

  /**
   * Two cached fetches, not one.
   *
   * The style endpoint returns one row and its slice of the manifest, which is
   * what the metadata and the prose need; the catalogue is fetched as well
   * because the specification block links a cut to its categories and its
   * textures by *name*, and a name is a catalogue row. Both are revalidated on
   * the same hour, so a crawl of every style page is two fetches in total rather
   * than two per page.
   *
   * Either may be null — no API configured, or it did not answer — and neither
   * is a reason to fail the page. `<StyleDetail>` fetches the catalogue in the
   * browser regardless, so a null here degrades to exactly what this page was
   * before it rendered anything on the server.
   */
  const [data, catalog] = await Promise.all([loadStyle(id), loadCatalog()]);
  const style = data?.hairstyle ?? null;
  const image = heroRender(data?.renders);

  const trail = style
    ? [
        { name: 'Home', path: '/' },
        { name: 'Hairstyles', path: '/hairstyles' },
        { name: style.name, path: `/styles/${id}` },
      ]
    : [];

  return (
    <Section className="pb-24 pt-3 sm:pt-14">
      {style && catalog ? (
        <JsonLd
          data={graph(
            {
              '@type': 'WebPage',
              '@id': abs(`/styles/${id}#page`),
              url: abs(`/styles/${id}`),
              name: styleTitle(style),
              description: styleDescription(style),
              isPartOf: { '@id': SITE_ID },
              publisher: { '@id': ORG_ID },
              primaryImageOfPage: image ? { '@type': 'ImageObject', url: image.url } : undefined,
              mainEntity: { '@id': `${abs(`/styles/${id}`)}#hairstyle` },
              inLanguage: 'en',
            },
            hairstyleLd(
              style,
              image,
              catalog.categories,
              offeredTypes(style, catalog.hairTypes),
            ),
            breadcrumbLd(trail),
            faqLd(styleFaq(style, catalog.hairTypes, catalog.hairLengths)),
          )}
        />
      ) : null}

      {/* Server-rendered, above the client tree, so a crawler and a visitor who
          landed here from a search result both get a way back before anything
          hydrates. `<StyleDetail>` keeps its own "All cuts" link — this is the
          trail the `BreadcrumbList` describes. */}
      {/* Drawn from `sm`. On a phone it is a second way back sitting directly
          above the first — `<StyleDetail>`'s own "All cuts" link — and the row
          it costs is a row the picture, both selectors and the button are all
          competing for in a window that has none to spare. The `BreadcrumbList`
          in the JSON-LD above is untouched and is what a crawler reads, so
          nothing about how this page is understood changes with the width.
          `--above-fold` in `<StyleDetail>` is measured against this. */}
      {trail.length ? <Breadcrumbs trail={trail} className="hidden sm:mb-6 sm:block" /> : null}

      <StyleDetail
        styleId={id}
        length={one(length)}
        gender={one(gender)}
        hairType={one(hairType)}
        buy={one(buy)}
      />

      {style && catalog ? (
        <StyleAbout
          style={style}
          categories={catalog.categories}
          hairTypes={catalog.hairTypes}
          hairLengths={catalog.hairLengths}
        />
      ) : null}
    </Section>
  );
}
