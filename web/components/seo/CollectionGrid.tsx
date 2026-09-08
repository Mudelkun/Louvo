import Link from 'next/link';

import type { HairColor, HairType, HairTypeId, Hairstyle, RenderManifest } from '../../lib/contract/catalog';
import { StyleCard } from '../StyleCard';

/**
 * A collection's cuts, drawn on the server.
 *
 * It is the catalogue's own `<StyleCard>` and not a second, simpler card written
 * for search, which would have been the obvious shortcut and is the mistake.
 * Two components drawing one hairstyle are two places a plate can be wrong, and
 * the simpler one would have shipped without the colour grade — which is not a
 * refinement here: the catalogue is shot in two shades, so an ungraded grid puts
 * a brown cut beside a black one and the difference reads as a hair colour
 * somebody chose. A crawler would index that picture.
 *
 * A client component renders on the server perfectly well; `'use client'` marks
 * where hydration *begins*, not where rendering happens. So the html carries
 * every `<a href>` and every `<img src>`, which is the whole point of these
 * pages, and the cards then pick up their cycling and their hearts in the
 * browser exactly as they do on `/styles`.
 *
 * The first row is `priority`, because a collection page's largest contentful
 * paint is one of these plates and lazy-loading the thing being measured is how
 * a page loses on a metric that is itself a ranking signal.
 */
const EAGER = 4;

export function CollectionGrid({
  styles,
  hairTypes,
  manifest,
  gender,
  hairType,
  color,
}: {
  styles: Hairstyle[];
  hairTypes: HairType[];
  manifest: RenderManifest;
  gender: Hairstyle['genders'][number] | null;
  hairType: HairTypeId | null;
  color: HairColor | null;
}) {
  /**
   * The answers this page stands for, carried into every card.
   *
   * A collection *is* a pair of answers, so a cut opened from the women's coily
   * shelf has to open on the women's coily render — the same promise every grid
   * on the site already keeps, reached from a url instead of from a session.
   */
  const params = new URLSearchParams();
  if (gender) params.set('gender', gender);
  if (hairType) params.set('hairType', hairType);
  const query = params.toString();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:gap-6">
      {styles.map((style, index) => (
        <StyleCard
          key={style.id}
          style={style}
          hairTypes={hairTypes}
          manifest={manifest}
          gender={gender}
          hairType={hairType}
          color={color}
          query={query}
          priority={index < EAGER}
        />
      ))}
    </div>
  );
}

/**
 * The other collections, as links.
 *
 * This is the half of a collection page that is not about the collection, and it
 * is the half that makes the set work. Thirty pages that each link only to
 * hairstyles are thirty leaves; thirty pages that link to each other are a
 * catalogue with a shape a crawler can walk, and the crawler is not the only
 * beneficiary — somebody who came here for "curly hairstyles" is one plausible
 * step from "curly hairstyles for men", and that step is otherwise a trip back
 * through a filter rail.
 *
 * Drawn as text links rather than as chips deliberately: this sits at the foot
 * of the page, under the grid, where it is a table of contents and not a
 * control. The controls for narrowing a catalogue are on `/styles`, and two
 * things that look the same and behave differently is the mistake the filter
 * rail was rebuilt to avoid.
 */
export function CollectionLinks({
  heading,
  links,
  className = '',
}: {
  heading: string;
  links: { slug: string; heading: string }[];
  className?: string;
}) {
  if (!links.length) return null;
  return (
    <nav aria-label={heading} className={className}>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">{heading}</h2>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2.5">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={`/hairstyles/${link.slug}`}
              className="text-[13.5px] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
            >
              {link.heading}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
