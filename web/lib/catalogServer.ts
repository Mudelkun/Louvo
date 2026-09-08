/**
 * The catalogue, read on the server.
 *
 * `<CatalogProvider>` is the browser's copy and is unchanged: one fetch of
 * `/v1/catalog` per session, everything filtered against memory. This module is
 * the *other* reader, and it exists for one reason — **a crawler is not a
 * browser**.
 *
 * Every catalogue surface on this site was a client component reading that
 * provider, which means the html served for `/styles/blunt-bob` was a skeleton:
 * no heading, no description, no image, and no link to any other cut. Google
 * does render JavaScript, but it does so on a second pass, days later, from a
 * queue it prioritises by how much it already trusts the site — which is the
 * worst possible arrangement for a new domain whose entire SEO argument is
 * "fifty-odd indexable pages". A page whose content only exists after hydration
 * is a page competing with one bad hand tied behind it.
 *
 * So the pages that matter to search now render their substance on the server
 * from this module and hand the *interactive* part to the client component
 * beside it. Nothing was moved out of the browser: `<StyleDetail>` still owns
 * the plate, the deck, the two controls and the button that spends a credit.
 * What changed is that the words and the picture are in the document before any
 * of that runs.
 *
 * ## Caching
 *
 * `revalidate: 3600`. The catalogue changes when somebody runs a publish, which
 * is not often and is never urgent — an hour of staleness on a collection page
 * is invisible, where a fetch per crawl of every style page is a request storm
 * pointed at Railway by whoever is crawling us that day. The browser's copy is
 * unaffected and still live.
 *
 * ## Failure
 *
 * Every function here answers `null` on any failure and no page throws on it.
 * A 500 on a style page teaches a crawler to stop asking; a page that renders
 * its shell and lets the client fill it in is exactly what the site did before
 * this file existed, so degrading to that is safe by construction.
 */

import { API_URL } from './config';
import type {
  CatalogResponse,
  Gender,
  HairTypeId,
  Hairstyle,
  RenderManifest,
  RenderRef,
} from './contract/catalog';
import { HERO_ANGLE } from './renders';

const REVALIDATE = 3600;

/** The whole catalogue, or null when there is no API or it did not answer. */
export async function loadCatalog(): Promise<CatalogResponse | null> {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}/v1/catalog`, { next: { revalidate: REVALIDATE } });
    if (!response.ok) return null;
    return (await response.json()) as CatalogResponse;
  } catch {
    return null;
  }
}

export interface StyleBundle {
  hairstyle: Hairstyle;
  renders: RenderManifest[string];
}

/**
 * One cut and its slice of the manifest.
 *
 * A separate endpoint rather than a filter over `loadCatalog()`, because a style
 * page needs one row and the full document is ~45 KB of catalogue it will not
 * look at. Both are cached for the same hour, so a page that wants the whole
 * catalogue as well (for related cuts, or for the categories a cut belongs to)
 * pays for one fetch of each and no more.
 */
export async function loadStyle(id: string): Promise<StyleBundle | null> {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}/v1/hairstyles/${encodeURIComponent(id)}`, {
      next: { revalidate: REVALIDATE },
    });
    if (!response.ok) return null;
    return (await response.json()) as StyleBundle;
  } catch {
    return null;
  }
}

/**
 * The one render that stands for a cut: hero angle, anchor length, and whichever
 * variant and gender the caller asked for or the manifest happens to hold.
 *
 * This is what a shared link unfurls into, what an `og:image` points at and what
 * a server-rendered card draws — so it has to resolve to *something* for a
 * partially-shot catalogue rather than being strict the way the on-screen
 * variant resolution is. That is not the same rule bent: `variantCandidates()`
 * is strict because showing somebody the curly render of a cut they asked to see
 * coily is a wrong image. Nothing has been declared here. A crawler asked for
 * "this haircut" and any studio shot of it is a true answer.
 *
 * The search is ordered rather than a scan of whatever `Object.values` yields
 * first: hero angle before the others, because a card and a chat unfurl both
 * want the three-quarter view, and the requested gender before the other one.
 */
export function heroRender(
  renders: RenderManifest[string] | undefined,
  options: { gender?: Gender | null; variant?: HairTypeId | null } = {},
): RenderRef | null {
  if (!renders) return null;

  const genders: Gender[] = options.gender
    ? [options.gender, options.gender === 'male' ? 'female' : 'male']
    : ['female', 'male'];

  // Preferred variant first when one was asked for, then the catalogue's own
  // order — `any` is the single render that serves every type, so it is the
  // most likely to exist at all.
  const variants = [
    ...(options.variant ? [options.variant] : []),
    'any',
    'straight',
    'wavy',
    'curly',
    'coily',
  ];

  for (const variant of variants) {
    const byLength = renders[variant as keyof typeof renders];
    if (!byLength) continue;
    for (const length of ['medium', 'short', 'long'] as const) {
      const byGender = byLength[length];
      if (!byGender) continue;
      for (const gender of genders) {
        const byAngle = byGender[gender];
        if (!byAngle) continue;
        const ref = byAngle[HERO_ANGLE] ?? byAngle.front ?? byAngle.side ?? byAngle.back;
        if (ref?.url) return ref;
      }
    }
  }
  return null;
}

/**
 * Every render of a cut, deduped by url — the set an `ImageObject` list and the
 * image sitemap are built from.
 *
 * Deduped because one file commonly serves several variants (that is the whole
 * economy of the matrix), and listing the same url four times in an image
 * sitemap is four claims about one picture.
 */
export function allRenders(renders: RenderManifest[string] | undefined): RenderRef[] {
  const seen = new Set<string>();
  const out: RenderRef[] = [];
  for (const byLength of Object.values(renders ?? {})) {
    for (const byGender of Object.values(byLength ?? {})) {
      for (const byAngle of Object.values(byGender ?? {})) {
        for (const ref of Object.values(byAngle ?? {})) {
          if (ref?.url && !seen.has(ref.url)) {
            seen.add(ref.url);
            out.push(ref);
          }
        }
      }
    }
  }
  return out;
}
