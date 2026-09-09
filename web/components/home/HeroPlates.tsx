'use client';

/**
 * What stands in the hero until the before/after pair exists.
 *
 * Not a decoration and not a placeholder: three real catalogue renders, picked
 * out of the live catalogue, so a deployment with no `public/hero/` images still
 * shows the visitor the actual objects the product is made of. That is the same
 * bargain the strip below the fold makes — "we have a catalogue" is a claim and a
 * row of cuts is evidence.
 *
 * It is the weaker of the two heroes and it should be replaced. A grid of
 * mannequins answers *what is in there*; only a before and after answers *will
 * this look like me*, which is the question that actually decides whether
 * somebody uploads a photograph. See `public/hero/README.md`.
 *
 * Nothing here names a hairstyle. The cuts are chosen by "has a render, then
 * popularity", which is what keeps adding a hairstyle a `catalog:publish` rather
 * than a release — on the front page as much as in the grid.
 */

import Link from 'next/link';
import { useMemo } from 'react';

import { displayVariants } from '../../lib/displayVariants';
import { textureFor } from '../../lib/hairTypes';
import { HERO_ANGLE, resolveRender } from '../../lib/renders';
import { useCatalog } from '../../lib/state/CatalogContext';
import { useSession } from '../../lib/state/SessionContext';
import { Plate } from '../Plate';
import { Skeleton } from '../ui';

/**
 * One larger plate flanked by two smaller ones. Three equal plates in a row is a
 * contact sheet; a size difference is what makes the group read as a composition
 * rather than as the first three results — and it is an honest hierarchy, since
 * the middle plate is the most popular cut the catalogue currently holds.
 */
const LAYOUT = [
  { offset: 'z-20 translate-y-4 sm:translate-y-8', width: 'w-[27%] max-w-[178px]' },
  { offset: 'z-30 -translate-y-4 sm:-translate-y-6', width: 'w-[34%] max-w-[224px]' },
  { offset: 'z-10 translate-y-6 sm:translate-y-12', width: 'w-[27%] max-w-[178px]' },
];

export function HeroPlates() {
  const { catalog, hairstyles, defaultColor, loading } = useCatalog();
  const { gender, hairType } = useSession();

  const picks = useMemo(() => {
    if (!catalog) return [];
    return hairstyles
      .filter((style) => (gender ? style.genders.includes(gender) : true))
      .map((style) => ({
        style,
        render: resolveRender(catalog.renders, {
          styleId: style.id,
          gender,
          angle: HERO_ANGLE,
          variants: displayVariants(catalog.renders, style, hairType, { gender }).variants,
        }),
      }))
      // Renders first, then popularity: a catalogue whose imagery has not been
      // published yet falls back to illustrations rather than to three
      // placeholders that never resolve, which reads as a broken page.
      .sort(
        (a, b) =>
          Number(!!b.render) - Number(!!a.render) || b.style.popularity - a.style.popularity,
      )
      .slice(0, 3);
  }, [catalog, hairstyles, gender, hairType]);

  if (loading || picks.length === 0) {
    return (
      <div className="flex items-end justify-center gap-3 sm:gap-4">
        {LAYOUT.map((entry, index) => (
          <Skeleton
            key={index}
            className={`aspect-[4/5] rounded-[18px] ${entry.width} ${entry.offset}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-4">
      {picks.map((entry, index) => (
        <Link
          key={entry.style.id}
          href={`/styles/${entry.style.id}`}
          className={
            `group relative shrink-0 ${LAYOUT[index].width} ${LAYOUT[index].offset} ` +
            'transition-transform duration-700 [transition-timing-function:var(--ease-out-quint)] ' +
            'hover:!translate-y-0 focus-visible:!translate-y-0'
          }
        >
          <div
            className={
              'overflow-hidden rounded-[18px] bg-plate ring-1 ring-inset ring-white/10 ' +
              'shadow-[0_30px_70px_-30px_rgb(0_0_0/0.95)]'
            }
          >
            <Plate
              render={entry.render}
              shape={entry.style.shape}
              texture={textureFor(entry.style, hairType)}
              color={defaultColor}
              gender={gender}
              angle={HERO_ANGLE}
              alt={entry.style.name}
              priority={index === 1}
              className="aspect-[4/5] w-full"
            />
          </div>
          <p
            className={
              'mt-2.5 truncate text-center text-[11.5px] font-medium text-muted ' +
              'transition-colors duration-300 group-hover:text-ink'
            }
          >
            {entry.style.name}
          </p>
        </Link>
      ))}
    </div>
  );
}
