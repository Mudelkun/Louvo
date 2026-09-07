import type { MetadataRoute } from 'next';

import { SITE_URL } from '../lib/config';

/**
 * What crawlers may have.
 *
 * The catalogue is the point of indexing this site, so it is wide open. The four
 * private areas are disallowed here *as well as* carrying `robots: { index:
 * false }` in their own metadata, and the duplication is deliberate: the meta
 * tag stops a page that was already fetched from being indexed, and this stops
 * it being fetched at all. `/studio/result/…` is the one that matters — the id
 * in that path names a preview, and while the page renders nothing without the
 * browser that made it, there is no reason for a crawler to be walking those
 * urls in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/studio', '/looks', '/account', '/s/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
