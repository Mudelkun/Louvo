import type { MetadataRoute } from 'next';

import { API_URL, SITE_URL } from '../lib/config';
import { LEGAL_DOCUMENTS } from '../lib/contract/legal';

/**
 * The sitemap, with every hairstyle in it.
 *
 * This is the whole SEO argument for putting Luvo on the web before an app
 * store: a catalogue of several dozen named haircuts, each on its own indexable
 * page with its own studio render, is several dozen entry points that a mobile
 * binary does not have. So the style pages are fetched from the live catalogue
 * rather than listed by hand — a hairstyle published today is in the sitemap
 * today, which is the same "publish, not release" property the rest of the app
 * has.
 *
 * Everything behind the try-on is deliberately absent: those pages are somebody's
 * face and their in-progress work, and each carries `robots: { index: false }`
 * of its own. So are the two marketing pages that used to be listed here — they
 * no longer exist, and `next.config.ts` redirects them permanently rather than
 * leaving two indexed 404s.
 */
async function hairstyleIds(): Promise<string[]> {
  if (!API_URL) return [];
  try {
    const response = await fetch(`${API_URL}/v1/hairstyles`, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const body = (await response.json()) as { hairstyles: { id: string }[] };
    return body.hairstyles.map((style) => style.id);
  } catch {
    // A sitemap missing its style pages is worse than one that is late, but it
    // is much better than a 500 on `/sitemap.xml` — which is how a crawler
    // learns to stop asking.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/styles`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...LEGAL_DOCUMENTS.map((document) => ({
      url: `${SITE_URL}/legal/${document.slug}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];

  const styles = await hairstyleIds();
  return [
    ...fixed,
    ...styles.map((id) => ({
      url: `${SITE_URL}/styles/${id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
