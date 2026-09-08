/**
 * Everything this site tells a search engine about itself, in one place.
 *
 * The web build exists for three reasons and only one of them is convenience: a
 * release is a deploy rather than a submission, Stripe takes ~3% where the
 * stores take 15-30%, and — the reason this file is here — **fifty-odd named
 * haircuts on indexable pages are fifty-odd entry points a binary does not
 * have**. `docs/web.md` makes that argument; this module is what makes it true.
 *
 * Three rules govern anything added here.
 *
 * **No hairstyle name, category name or hair type name appears in this file.**
 * The same constraint every other module on the site is written under: a title
 * is composed *from* catalog data, never typed out beside it, so publishing a
 * cut puts it in the sitemap, in a collection page and in an `ItemList` with no
 * release. A hardcoded name here would be the one place the catalogue could go
 * stale.
 *
 * **Every claim in a structured-data document has to be true on the page.**
 * Structured data describing something the visitor cannot find is what manual
 * actions are for, and it is the same honesty rule the footer's `<SourceLine>`
 * follows: a page says what it actually is. So an `ItemList` lists items that
 * are really linked, a `FAQPage` answers questions that are really written out,
 * and there is no `offers` node anywhere — we quote no price in this build
 * (`credit_products` has no price column; Stripe owns the number), and inventing
 * one for a rich result would be a fiction with a currency symbol on it.
 *
 * **A canonical is mandatory on every indexable page.** The catalogue's links
 * carry `?gender=`, `?hairType=` and `?length=` — answers about the picture
 * somebody clicked, which is exactly right for the visitor and exactly wrong for
 * a crawler, because it turns one haircut into a dozen urls of near-identical
 * content competing with each other. Every page declares the bare path it wants
 * to be indexed as, and the parameters keep working untouched.
 */

import { SITE_URL } from './config';
import type { Category, HairType, Hairstyle } from './contract/catalog';

export const SITE_NAME = 'Luvo';

/**
 * What Luvo is, in the words somebody would actually type.
 *
 * "See the haircut before the chair" is the brand line and it is good writing;
 * it is also a phrase nobody searches for. A title tag has two audiences and the
 * first one is a query — so the category noun leads and the brand line follows,
 * rather than the other way round. The line survives; it has stopped being asked
 * to do the whole job alone.
 */
export const TAGLINE = 'Virtual hairstyle try-on';

export const SITE_DESCRIPTION =
  'Try on hairstyles with one photo. Luvo generates a realistic preview of you in ' +
  'any cut in the catalogue — each one from a studio render of that exact haircut, ' +
  'not guessed from its name.';

/** An absolute url, which structured data needs and relative metadata does not. */
export const abs = (path: string): string =>
  path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

// ---------------------------------------------------------------------------
// Titles and descriptions, composed from catalog data
// ---------------------------------------------------------------------------

/**
 * A style page's title.
 *
 * Two things in about sixty characters: the cut's name, which is the query, and
 * what this page lets you do with it, which is what separates the result from
 * the thirty editorial listicles around it. "Try it on your photo" is a promise
 * no article on the page can make, and it is the click.
 */
export const styleTitle = (style: Pick<Hairstyle, 'name'>): string =>
  `${style.name} — try this haircut on your photo`;

/**
 * A style page's description, built from the row rather than written per cut.
 *
 * The catalogue's own description first, because it is authored prose about that
 * specific haircut and nothing generated will beat it, then the two facts a
 * search result cannot get anywhere else — who it is offered for, and how much
 * upkeep it is. Clamped to about 158 characters, which is where Google starts
 * cutting.
 */
export function styleDescription(style: Hairstyle): string {
  const audience =
    style.genders.length === 2
      ? "Men's and women's"
      : style.genders[0] === 'male'
        ? "Men's"
        : "Women's";
  return clamp(
    `${style.description} ${audience}, ${style.maintenance.toLowerCase()} upkeep. ` +
      'See it on your own face in about a minute.',
    158,
  );
}

/** Cut on a word boundary, so a description never ends mid-syllable. */
export function clamp(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > 0 ? cut.slice(0, space) : cut}…`;
}

// ---------------------------------------------------------------------------
// Open Graph and Twitter, composed rather than inherited
// ---------------------------------------------------------------------------

/**
 * The default card image: the generated one in `app/opengraph-image.tsx`.
 *
 * Named here rather than left to the file convention, because **`openGraph` is
 * replaced wholesale, not merged.** A page that declares `openGraph` to set its
 * own title loses every field the layout set — `siteName`, `locale` and the
 * file-based image with it — and the failure is silent: the page looks correct,
 * and the link posted into a chat is a bare grey row with no picture. The two
 * helpers below exist so that cannot happen by omission.
 */
export const OG_IMAGE = {
  url: abs('/opengraph-image'),
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${TAGLINE.toLowerCase()}`,
};

export interface CardImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** An Open Graph block with the sitewide fields already in it. */
export const og = (options: {
  path: string;
  title: string;
  description: string;
  type?: 'website' | 'article';
  images?: CardImage[];
}) => ({
  type: options.type ?? ('website' as const),
  siteName: SITE_NAME,
  locale: 'en',
  url: abs(options.path),
  title: options.title,
  description: options.description,
  images: options.images?.length ? options.images : [OG_IMAGE],
});

/** The Twitter card, which has the same replacement rule and the same trap. */
export const tw = (options: { title: string; description: string; images?: CardImage[] }) => ({
  card: 'summary_large_image' as const,
  title: options.title,
  description: options.description,
  images: (options.images?.length ? options.images : [OG_IMAGE]).map((image) => image.url),
});

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

/**
 * The publisher and the site, referenced by `@id` rather than repeated.
 *
 * One node each, with stable ids, is what lets a crawler join the graph up — a
 * page saying `isPartOf: <site>` and `publisher: <org>` describes a structure,
 * where thirty pages each carrying an anonymous copy of the same organisation
 * describe thirty unrelated things.
 */
export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;

export const organizationLd = () => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE_NAME,
  url: abs('/'),
  logo: { '@type': 'ImageObject', url: abs('/luvo-mark.png') },
  description: SITE_DESCRIPTION,
});

/**
 * The site, with the catalogue search declared as its action.
 *
 * `SearchAction` is what a sitelinks searchbox is built from, and it is honest
 * here only because `/styles?search=` is a real url that really filters the grid
 * — `<CatalogBrowser>` seeds its box from that parameter for exactly this
 * reason. A target pointing at a query string the site ignores is structured
 * data describing a page that does not exist.
 */
export const websiteLd = () => ({
  '@type': 'WebSite',
  '@id': SITE_ID,
  name: SITE_NAME,
  url: abs('/'),
  description: SITE_DESCRIPTION,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/styles?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
});

/**
 * The product itself, described as the thing it is: an application you use in a
 * browser to do one job.
 *
 * `WebApplication` rather than `MobileApplication`, because this url *is* the
 * application — a visitor is one photograph away from using it with nothing to
 * install. There is no `offers` and no `aggregateRating`: the price lives in
 * Stripe and this build never sees it, and we have no ratings. Those two are the
 * most-faked properties in the vocabulary and both are absent for the same
 * reason the packs carry no struck-through price.
 */
export const applicationLd = () => ({
  '@type': 'WebApplication',
  '@id': `${SITE_URL}/#application`,
  name: SITE_NAME,
  url: abs('/'),
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript.',
  description: SITE_DESCRIPTION,
  publisher: { '@id': ORG_ID },
  featureList: [
    'Try a haircut on your own photo',
    'Hairstyles shown on straight, wavy, curly and coily hair',
    "Men's and women's cuts, four angles each",
    'Adjust the length before generating',
    'Share a finished look',
  ],
});

export interface Crumb {
  name: string;
  path: string;
}

/**
 * The trail, which is the one rich result on this site that is close to
 * guaranteed: Google renders breadcrumbs in place of the url on most results.
 *
 * It is also why `<Breadcrumbs>` draws the same trail on the page. A
 * `BreadcrumbList` describing a path the visitor cannot see is a claim about the
 * page rather than a description of it.
 */
export const breadcrumbLd = (trail: Crumb[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: abs(crumb.path),
  })),
});

/**
 * A list of cuts, in the order they are drawn.
 *
 * Urls only, rather than an embedded object per item: an `ItemList` of urls is a
 * statement about *this* page's ordering, which is what it is for, where
 * inlining every hairstyle would restate the catalogue on every collection page
 * and invite the graph to disagree with itself about a cut it already describes
 * on that cut's own page.
 */
export const itemListLd = (styles: Pick<Hairstyle, 'id' | 'name'>[], name: string) => ({
  '@type': 'ItemList',
  name,
  numberOfItems: styles.length,
  itemListElement: styles.map((style, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: style.name,
    url: abs(`/styles/${style.id}`),
  })),
});

export interface Qa {
  question: string;
  answer: string;
}

/**
 * Questions and answers, every one of them written out on the page.
 *
 * Google narrowed FAQ rich results to health and government sites in 2023, so
 * this is no longer a route to a bigger blue link. It is still worth having for
 * the other half of what structured data does: it states, in a form a machine
 * reads without ambiguity, what this page is about — and the questions *are* the
 * queries, which is what an answer engine matches against.
 */
export const faqLd = (entries: Qa[]) => ({
  '@type': 'FAQPage',
  mainEntity: entries.map((entry) => ({
    '@type': 'Question',
    name: entry.question,
    acceptedAnswer: { '@type': 'Answer', text: entry.answer },
  })),
});

/**
 * One haircut, as a `CreativeWork` with the catalogue's own render attached.
 *
 * Not `Product`. A hairstyle here is not stock: it has no price, no SKU and no
 * availability, and marking one up as a product to reach for a shopping result
 * would be a lie about what the page offers — what is sold is a *preview*, on
 * `/account`, in credits. The `ImageObject` is doing the real work: image search
 * is where "what does a taper fade look like from the back" actually gets
 * answered, and the render is the answer.
 */
export function hairstyleLd(
  style: Hairstyle,
  image: { url: string; width: number; height: number } | null,
  categories: Category[],
  offeredTypes: HairType[],
) {
  const named = categories.filter((category) => style.categoryIds.includes(category.id));
  return {
    '@type': 'CreativeWork',
    '@id': `${SITE_URL}/styles/${style.id}#hairstyle`,
    name: style.name,
    url: abs(`/styles/${style.id}`),
    description: style.description,
    genre: named.map((category) => category.name),
    keywords: [
      ...style.tags,
      ...offeredTypes.map((type) => `${type.name.toLowerCase()} hair`),
    ].join(', '),
    audience: {
      '@type': 'PeopleAudience',
      suggestedGender: style.genders.length === 2 ? 'unisex' : style.genders[0],
    },
    publisher: { '@id': ORG_ID },
    ...(image
      ? {
          image: {
            '@type': 'ImageObject',
            url: image.url,
            width: image.width,
            height: image.height,
            caption: `${style.name} — Luvo studio render`,
          },
        }
      : {}),
  };
}

/**
 * Wrap a set of nodes into one document.
 *
 * One `@graph` per page rather than four separate `<script>` tags: the nodes
 * reference each other by `@id`, and a parser is not obliged to join ids across
 * separate documents.
 */
export const graph = (...nodes: unknown[]) => ({
  '@context': 'https://schema.org',
  '@graph': nodes.filter(Boolean),
});
