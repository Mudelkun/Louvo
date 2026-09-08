import type { MetadataRoute } from 'next';

import { SITE_URL } from '../lib/config';

/**
 * What crawlers may have.
 *
 * The catalogue is the point of indexing this site, so it is wide open. The
 * private areas are disallowed here *as well as* carrying `robots: { index:
 * false }` in their own metadata, and the duplication is deliberate: the meta
 * tag stops a page that was already fetched from being indexed, and this stops
 * it being fetched at all. `/studio/result/…` is the one that matters — the id
 * in that path names a preview, and while the page renders nothing without the
 * browser that made it, there is no reason for a crawler to be walking those
 * urls in the first place.
 *
 * ## The query strings are not disallowed, and that is on purpose
 *
 * `/styles/blunt-bob?gender=female&hairType=coily` is the same haircut as the
 * bare path, and there are a dozen such urls per cut. The instinct is to block
 * the parameters here; the right tool is the canonical each page declares,
 * because `Disallow` stops a crawl rather than a duplicate — a blocked url that
 * something links to can still be indexed, now with no content and no way for us
 * to say what it is a copy of, and any link equity pointing at it is thrown
 * away. Canonicals consolidate; robots rules discard. See `lib/seo.ts`.
 *
 * ## The AI crawlers are allowed, and that is a decision
 *
 * `GPTBot`, `PerplexityBot`, `ClaudeBot` and the rest are not listed, so the
 * blanket rule admits them. That is deliberate rather than an omission: a growing
 * share of "which app lets me try a haircut on my photo" is answered inside an
 * assistant rather than on a results page, and a site that is not readable there
 * is not in the answer. There is nothing to protect by refusing — every page they
 * can reach is a catalogue of mannequin renders and authored prose about
 * haircuts. Nothing behind the try-on is reachable, which is the line that
 * matters: a preview is somebody's face and is disallowed below.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/studio',
    '/looks',
    '/account',
    '/sign-in',
    '/sign-up',
    '/sso-callback',
    '/s/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      /**
       * Googlebot's own copy of the same rules, plus the image crawler.
       *
       * `Googlebot-Image` inherits the `*` group only when it has no group of
       * its own, and the renders are the half of this site most worth having in
       * an image index — so it is named explicitly rather than left to a rule
       * precedence nobody should have to remember.
       */
      { userAgent: 'Googlebot', allow: '/', disallow },
      { userAgent: 'Googlebot-Image', allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
