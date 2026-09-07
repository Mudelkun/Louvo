import type { Metadata } from 'next';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense } from 'react';

import type { HeroImages } from '../components/home/HeroCompare';
import { TryOnFlow } from '../components/home/TryOnFlow';
import { Skeleton } from '../components/ui';

export const metadata: Metadata = {
  title: 'Luvo — try a haircut on before you sit in the chair',
  description:
    'Upload one photo and see yourself in any haircut in the Luvo catalogue. Every preview is generated from a studio render of that exact cut, not guessed from its name.',
};

/**
 * The front door, and it is the product rather than a page about the product.
 *
 * What used to be here was a landing page: a hero, three explanatory sections, a
 * privacy essay and a closing call to action, with the actual try-on one click
 * away behind a button. That is a shape borrowed from software that has to
 * *convince* somebody before it can show them anything. Luvo does not — the
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
    <Suspense fallback={<FlowSkeleton />}>
      <TryOnFlow hero={heroImages()} />
    </Suspense>
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
 * The upload state's layout, with nothing in it yet.
 *
 * `useSearchParams` forces the tree under it out of the static render, so this
 * is what is served until the client picks it up. It states the layout — words
 * and a drop box on the left, one frame on the right — and nothing about what
 * will be in them, which is the rule every placeholder on the site follows.
 */
function FlowSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 sm:px-8 lg:px-12 lg:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-5 h-12 w-full max-w-[460px]" />
          <Skeleton className="mt-3 h-12 w-full max-w-[380px]" />
          <Skeleton className="mt-6 h-16 w-full max-w-[520px]" />
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
