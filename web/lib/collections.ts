/**
 * The collection pages, and the reason they exist rather than query strings.
 *
 * `/styles` is one url with four controls on it. A visitor moves them and the
 * grid narrows instantly, which is the right interaction and is worth nothing to
 * search: the filters are React state, so there is no url to rank, and where the
 * answers *do* reach the url — `?gender=`, `?hairType=` — they produce a dozen
 * near-identical documents competing with each other for the same query. Faceted
 * navigation is the classic way a catalogue site quietly poisons its own index.
 *
 * The standard fix is the one taken here: a small, **fixed** set of collections
 * gets a real url, a real heading, its own copy and its own canonical, and every
 * other combination stays a query parameter that is never indexed. Each page
 * below answers a query somebody actually types — "men's hairstyles", "curly
 * hairstyles", "fade haircuts", "short haircuts for women" — which is a whole
 * band of demand between the brand ("luvo") and the individual cut ("blunt
 * bob"), and it is the band the site had nothing at all in.
 *
 * ## The grammar
 *
 * A slug is an optional gender prefix and one facet:
 *
 *   men | women                      — a gender on its own
 *   <type>-hair                      — a hair type on its own
 *   <category>                       — a category on its own
 *   men-<type>-hair | women-<type>-hair
 *   men-<category>  | women-<category>
 *
 * Every part of it is catalog data. There is no list of category names here and
 * no hairstyle name anywhere — publishing a category creates its pages, and the
 * generator below is what puts them in the sitemap.
 *
 * ## Thin pages are worse than no pages
 *
 * A collection with two cuts in it is a page with nothing on it, and enough of
 * them is a site that looks auto-generated, which it would be. `MIN_STYLES` is
 * the floor: a combination that does not clear it is not enumerated, is not in
 * the sitemap and 404s. That is deliberate — a 404 for a page with nothing to
 * say is honest, and it is the same instinct as the hair-type examples falling
 * back to icons rather than showing a partial set.
 */

import type { Category, Gender, HairType, HairTypeId, Hairstyle } from './contract/catalog';
import { filterHairstyles } from './hairTypes';

/** Below this a collection has nothing to say, so it does not get a url. */
export const MIN_STYLES = 4;

const GENDER_SLUG: Record<Gender, string> = { male: 'men', female: 'women' };
const GENDER_WORD: Record<Gender, string> = { male: "Men's", female: "Women's" };
const GENDER_PLAIN: Record<Gender, string> = { male: 'men', female: 'women' };

export interface Collection {
  slug: string;
  /** What the `<h1>` says. */
  heading: string;
  /** The `<title>`, which is not the heading — it carries the verb. */
  title: string;
  description: string;
  /** The paragraph under the heading. One or two sentences, no filler. */
  intro: string;
  gender: Gender | null;
  hairType: HairTypeId | null;
  categoryId: string | null;
}

interface Facets {
  categories: Category[];
  hairTypes: HairType[];
}

/**
 * Resolve a slug against the live catalogue.
 *
 * Returns null for anything that is not a real collection, which the page turns
 * into a 404 — a made-up facet must not render an empty grid under a confident
 * heading.
 */
export function parseCollection(slug: string, facets: Facets): Collection | null {
  let rest = slug.toLowerCase();
  let gender: Gender | null = null;

  for (const [id, prefix] of Object.entries(GENDER_SLUG) as [Gender, string][]) {
    if (rest === prefix) return compose(id, null, null, facets);
    if (rest.startsWith(`${prefix}-`)) {
      gender = id;
      rest = rest.slice(prefix.length + 1);
      break;
    }
  }

  const type = facets.hairTypes.find((entry) => `${entry.id}-hair` === rest);
  if (type) return compose(gender, type, null, facets);

  const category = facets.categories.find((entry) => entry.id === rest);
  if (category) return compose(gender, null, category, facets);

  return null;
}

/**
 * The copy, assembled from the catalogue's own words.
 *
 * A category carries a `tagline` and a hair type carries a `description`, both
 * authored beside the data they describe — so the intro on a collection page is
 * the catalogue talking about itself rather than a template with a noun slotted
 * into it. That is what keeps thirty collection pages from reading as thirty
 * copies of one page, which is the failure mode this whole route has to avoid.
 */
function compose(
  gender: Gender | null,
  type: HairType | null,
  category: Category | null,
  facets: Facets,
): Collection {
  const slug = [
    gender ? GENDER_SLUG[gender] : null,
    type ? `${type.id}-hair` : category ? category.id : null,
  ]
    .filter(Boolean)
    .join('-');

  const owner = gender ? GENDER_WORD[gender] : null;
  const plural = gender ? GENDER_PLAIN[gender] : 'everyone';

  // The subject of the page, before a gender is attached to it.
  const subject = type
    ? `${type.name} Hairstyles`
    : category
      ? category.name
      : 'Hairstyles';

  const heading = owner ? `${owner} ${subject}` : subject;

  const title = type
    ? `${heading} — try a cut for ${type.name.toLowerCase()} hair on your photo`
    : category
      ? `${heading} — try them on your own photo`
      : `${heading} — try a haircut on your own photo`;

  const intro = type
    ? `Every cut in the Louvo catalogue offered for ${type.tier.toLowerCase()} hair — ${type.description.toLowerCase()} — ` +
      `shown on ${type.name.toLowerCase()} hair rather than on straight hair with a note under it. ` +
      `Pick one, upload a photo, and see it on yourself.`
    : category
      ? `${category.tagline}. Every ${category.name.toLowerCase().replace(/s$/, '')} in the catalogue` +
        `${owner ? ` offered for ${plural}` : ''}, shot the same way: one neutral mannequin, one light, four angles. ` +
        `Pick one and try it on your own photo.`
      : `Every haircut Louvo can put on ${plural === 'everyone' ? 'you' : plural}, ` +
        `shot the same way: one neutral mannequin, one light, four angles — and shown on ` +
        `${facets.hairTypes.length} hair textures rather than only on straight hair. ` +
        `Pick one, upload a photo, and see it on yourself before anybody picks up the scissors.`;

  const description = type
    ? `Browse ${heading.toLowerCase()} and see any of them on your own face. ` +
      `Every cut is rendered for ${type.name.toLowerCase()} hair, not approximated from a straight-haired photo.`
    : category
      ? `Browse ${heading.toLowerCase()} and try any of them on your own photo in about a minute. ` +
        `${category.tagline}, each shot at four angles on a neutral mannequin.`
      : `Browse ${heading.toLowerCase()} and try any of them on your own photo. ` +
        `Upload one picture and see the cut on your own face before you book.`;

  return {
    slug,
    heading,
    title,
    description,
    intro,
    gender,
    hairType: type ? type.id : null,
    categoryId: category ? category.id : null,
  };
}

/** The cuts on a collection page, in the order they are drawn. */
export const stylesIn = (source: Hairstyle[], collection: Collection): Hairstyle[] =>
  filterHairstyles(source, {
    gender: collection.gender,
    hairType: collection.hairType,
    categoryId: collection.categoryId,
    sort: 'popular',
  });

/**
 * Every collection worth a url, for `generateStaticParams` and the sitemap.
 *
 * Enumerated rather than listed, and filtered by what the catalogue can actually
 * fill: a category published for one gender only produces one gendered page, and
 * a texture nothing is offered for produces none. So this shrinks and grows with
 * the catalogue on its own, which is the property that makes the sitemap true
 * the day after a publish.
 */
export function allCollections(
  hairstyles: Hairstyle[],
  facets: Facets,
): Collection[] {
  const genders: (Gender | null)[] = [null, 'male', 'female'];
  const out: Collection[] = [];

  for (const gender of genders) {
    const facetSlugs = [
      ...facets.hairTypes.map((type) => `${type.id}-hair`),
      ...facets.categories.map((category) => category.id),
    ];
    // The bare gender pages first, so `/hairstyles/men` sorts above its facets.
    const slugs = gender ? [GENDER_SLUG[gender], ...facetSlugs.map((facet) => `${GENDER_SLUG[gender]}-${facet}`)] : facetSlugs;

    for (const slug of slugs) {
      const collection = parseCollection(slug, facets);
      if (!collection) continue;
      if (stylesIn(hairstyles, collection).length < MIN_STYLES) continue;
      out.push(collection);
    }
  }
  return out;
}
