import type { Metadata } from 'next';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense } from 'react';

import type { HeroImages } from '../components/home/HeroCompare';
import { HeroHeading } from '../components/home/HeroHeading';
import { TryOnFlow } from '../components/home/TryOnFlow';
import { HOME_FAQ, HomeSeo } from '../components/seo/HomeSeo';
import { JsonLd } from '../components/seo/JsonLd';
import { Skeleton } from '../components/ui';
import { abs, faqLd, graph, og, ORG_ID, SITE_DESCRIPTION, SITE_ID, tw } from '../lib/seo';

/**
 * The title carries the two nouns people search with, then the promise.
 *
 * "Try a haircut on before you sit in the chair" describes the product to
 * somebody who already knows what it is. What gets typed is "virtual hairstyle
 * try on", "haircut simulator", "what haircut suits me" — so the category noun
 * leads, and the sentence that made the old title good is still the second half
 * of it.
 *
 * **The separator is a colon and it used to be an em dash, which cost the first
 * half of the title.** Google treats ` - `, ` | ` and ` — ` as boundaries between
 * a page's title and its site's, and it will drop whichever side it judges
 * redundant — so the live listing read "see any haircut on your own photo",
 * starting on a lowercase verb, with the two words somebody actually types
 * thrown away. A colon is punctuation inside one sentence rather than a
 * separator between two, and the whole line survives it.
 */
const TITLE = 'Virtual hairstyle try-on: see any haircut on your own photo';

export const metadata: Metadata = {
  title: TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: og({ path: '/', title: TITLE, description: SITE_DESCRIPTION }),
  twitter: tw({ title: TITLE, description: SITE_DESCRIPTION }),
};

/**
 * The front door, and it is the product rather than a page about the product.
 *
 * What used to be here was a landing page: a hero, three explanatory sections, a
 * privacy essay and a closing call to action, with the actual try-on one click
 * away behind a button. That is a shape borrowed from software that has to
 * *convince* somebody before it can show them anything. Louvo does not — the
 * whole proposition is a forty-second demonstration, and a visitor is one photo
 * away from it. So the upload box is the first thing on the page, the one piece
 * of evidence beside it is a real before and after, and the argument for the
 * product is the product.
 *
 * The flow itself is `<TryOnFlow>`; everything about the three states it moves
 * through is documented there.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={graph(
          {
            '@type': 'WebPage',
            '@id': `${abs('/')}#page`,
            url: abs('/'),
            name: TITLE,
            description: SITE_DESCRIPTION,
            isPartOf: { '@id': SITE_ID },
            publisher: { '@id': ORG_ID },
            inLanguage: 'en',
          },
          faqLd(HOME_FAQ),
        )}
      />
      <Suspense fallback={<FlowSkeleton />}>
        <TryOnFlow hero={heroImages()} />
      </Suspense>
      {/*
        Below the product, never in front of it.

        `<TryOnFlow>` is a client component that reads the search params, so the
        html served for `/` is `<FlowSkeleton>` plus this — the heading comes
        from the fallback and the prose comes from here. Between them the front
        door of a site meant to rank for "virtual hairstyle try-on" has a
        heading, a paragraph and the questions people ask, without a crawler
        having to execute anything. The header of `<HomeSeo>` has the whole
        argument, including why it is not the landing page coming back.
      */}
      <HomeSeo />
    </>
  );
}

/**
 * The before/after pairs, found on disk rather than hardcoded.
 *
 * A missing file has to be a *fallback*, never a broken image in the hero, and
 * the only way to know at render time is to look. This runs on the server during
 * the static render, so it costs one directory read at build time and nothing
 * per request — and dropping the files in is then the whole job, with no import
 * to add and no extension to guess right.
 *
 * Pairs are matched on whatever follows the prefix, so `before-locs.webp` goes
 * with `after-locs.webp` and a bare `before.jpg` with `after.jpg`. A file with
 * no partner is dropped rather than shown against somebody else's face, which is
 * the one failure that would be worse than no hero at all. The order is the
 * directory's own, sorted, so renaming is how the set is arranged — there is no
 * list here to keep in step with the folder.
 *
 * `public/hero/README.md` is the instruction that sits beside them.
 */
function heroImages(): HeroImages[] {
  let entries: string[];
  try {
    entries = readdirSync(join(process.cwd(), 'public', 'hero'));
  } catch {
    // No directory at all is the ordinary state of a fresh checkout.
    return [];
  }

  const keyed = (prefix: string) => {
    const found = new Map<string, string>();
    // Sorted, so that a `before-1.jpg` left beside a stale `before-1.png` is
    // resolved the same way on every machine rather than by whichever the
    // filesystem happens to list first.
    for (const entry of [...entries].sort()) {
      if (!EXTENSION.test(entry)) continue;
      if (!entry.toLowerCase().startsWith(prefix)) continue;
      const key = entry.slice(prefix.length).replace(EXTENSION, '').toLowerCase();
      if (!found.has(key)) found.set(key, entry);
    }
    return found;
  };

  const befores = keyed('before');
  const afters = keyed('after');

  return [...befores.keys()]
    .filter((key) => afters.has(key))
    .sort()
    .map((key) => ({
      before: `/hero/${befores.get(key)!}`,
      after: `/hero/${afters.get(key)!}`,
    }));
}

/**
 * The upload state's layout, with the heading real and the rest not yet there.
 *
 * `useSearchParams` forces the tree under `<TryOnFlow>` out of the static
 * render, so **this is the html `/` actually serves** — to a first-pass crawler,
 * to a scraper, and to anybody on a slow connection before hydration. It was
 * five grey rectangles, which meant the front door of a site meant to rank for
 * "virtual hairstyle try-on" shipped with no `<h1>` and no sentence above the
 * fold. Google's answer to that was visible on the live listing: it rewrote the
 * title and built the description out of the *footer*.
 *
 * `<HeroHeading>` is the fix and it is the same component `<TryOnFlow>` renders,
 * so there is one copy of the words rather than a crawler-facing paraphrase.
 * Everything below it is still a placeholder, because the rule this file follows
 * has not changed: **a placeholder may state the layout, never the data.** The
 * heading is not data — it is the same sentence on every visit — where the drop
 * box, the photograph and the catalogue plates are all things that are not known
 * until the client has run.
 */
function FlowSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 sm:px-8 lg:px-12 lg:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16">
        <div>
          <HeroHeading />
          <Skeleton className="mt-7 h-[132px] w-full rounded-[20px]" />
        </div>
        <Skeleton className="aspect-[4/5] w-full rounded-[24px]" />
      </div>
    </div>
  );
}

/** The extensions the hero accepts, in one place: the pair matcher tests
 * against it and then strips it to get the key the two files are joined on. */
const EXTENSION = /\.(png|jpe?g|webp|avif)$/i;
