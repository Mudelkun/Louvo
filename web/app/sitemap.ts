import type { MetadataRoute } from 'next';

import { SITE_URL } from '../lib/config';
import { heroRender, loadCatalog } from '../lib/catalogServer';
import { allCollections } from '../lib/collections';
import { LEGAL_DOCUMENTS } from '../lib/contract/legal';

/**
 * The sitemap: every hairstyle, every collection, and the render each one is
 * illustrated by.
 *
 * This is the whole SEO argument for putting Louvo on the web before an app
 * store, stated as a file. A catalogue of several dozen named haircuts, each on
 * its own indexable page with its own studio render, is several dozen entry
 * points that a mobile binary does not have — plus the shelves under
 * `/hairstyles`, which are the band of demand between the brand and a single
 * cut. Both sets are derived from the live catalogue rather than listed by hand,
 * so a hairstyle published today is in the sitemap today: the same "publish, not
 * release" property the rest of the app has.
 *
 * ## The renders are in it, and that is not decoration
 *
 * Google discovers images through the pages that carry them, and the pages that
 * carry these are client-rendered — so an image sitemap is the one thing that
 * puts a render url in front of a crawler without waiting on a render pass. It
 * matters more here than on most sites: "what does a taper fade look like from
 * the back" is answered by a picture, image search is where that query lands,
 * and the catalogue is fifty-odd studio shots of exactly that.
 *
 * ## What is deliberately absent
 *
 * Everything behind the try-on: those pages are somebody's face and their
 * in-progress work, and each carries `robots: { index: false }` of its own on
 * top of the `Disallow` in `robots.ts`. So are the two marketing pages that used
 * to be listed here — they no longer exist, and `next.config.ts` redirects them
 * permanently rather than leaving two indexed 404s.
 *
 * ## Failure
 *
 * A catalogue that does not answer yields the fixed routes and nothing else. A
 * sitemap missing its style pages is worse than one that is late, and both are
 * far better than a 500 on `/sitemap.xml` — which is how a crawler learns to
 * stop asking.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/hairstyles`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/styles`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...LEGAL_DOCUMENTS.map((document) => ({
      url: `${SITE_URL}/legal/${document.slug}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];

  const catalog = await loadCatalog();
  if (!catalog) return fixed;

  /**
   * Collections above individual cuts in priority, which is the opposite of what
   * looks obvious.
   *
   * A style page is the more specific document and it converts better, but there
   * are fifty of them and three dozen shelves, and the shelves are what a
   * crawler uses to reach the cuts — they carry the internal links. Ranking them
   * slightly higher is a hint about crawl order, not a claim that they matter
   * more. Priority is advisory either way; the ordering is the useful part.
   */
  const collections = allCollections(catalog.hairstyles, catalog).map((collection) => ({
    url: `${SITE_URL}/hairstyles/${collection.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }));

  const styles = catalog.hairstyles.map((style) => {
    const image = heroRender(catalog.renders[style.id]);
    return {
      url: `${SITE_URL}/styles/${style.id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      // One image per entry: the hero render, which is what the page shows first
      // and what a shared link unfurls into. Listing all four angles here would
      // put three urls in front of a crawler that no page draws above the fold.
      ...(image ? { images: [image.url] } : {}),
    };
  });

  return [...fixed, ...collections, ...styles];
}
