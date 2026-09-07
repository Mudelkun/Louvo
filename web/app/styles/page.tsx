import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CatalogBrowser } from '../../components/CatalogBrowser';
import { StyleCardSkeleton } from '../../components/StyleCard';
import { ButtonLink, Section, Skeleton } from '../../components/ui';

export const metadata: Metadata = {
  title: 'The catalogue',
  description:
    'Every cut Luvo can put on you, shot the same way: one neutral mannequin, one light, four angles. Filter by texture, length and upkeep.',
};

export default function StylesPage() {
  return (
    <Section className="pb-24 pt-12 sm:pt-16">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(2rem,4.6vw,2.9rem)] leading-[1.04] tracking-[-0.02em]">
          The catalogue
        </h1>
        <ButtonLink href="/" size="sm">
          Try one on
        </ButtonLink>
      </header>

      {/* The browser reads `?gender=` and `?hairType=` off the url — the answers
          a grid or a finished preview minted into the link that got here — which
          forces the tree under it out of the static render. This is what is
          served until the client picks it up: the rail, a count and eight cards,
          all facts about the layout and none about the catalogue. */}
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogBrowser />
      </Suspense>
    </Section>
  );
}

function CatalogSkeleton() {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-[210px] rounded-full" />
        <Skeleton className="h-9 w-[260px] rounded-full" />
        <Skeleton className="h-9 w-[150px] rounded-full" />
      </div>
      <Skeleton className="mb-6 h-4 w-28" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:gap-6">
        {Array.from({ length: 8 }, (_, index) => (
          <StyleCardSkeleton key={index} />
        ))}
      </div>
    </>
  );
}
