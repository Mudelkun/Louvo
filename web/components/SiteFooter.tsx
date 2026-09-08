'use client';

/**
 * The footer, and the one place the site says what it is actually running on.
 *
 * `<SourceLine>` is the web's Settings screen, reduced to a sentence. The app
 * prints three of these — which catalog answered, where previews are generated,
 * whether a share link was really minted — because a degraded outcome that looks
 * identical to a healthy one is the failure mode this whole codebase is written
 * against. A site showing a cached catalog with no word about it is the same
 * mistake in a different shape.
 *
 * It is quiet on purpose: when everything is live it says "Live catalogue" in
 * muted text and nobody reads it. It only becomes worth reading when it is not.
 */

import Link from 'next/link';

import { hasApi } from '../lib/config';
import { LEGAL_DOCUMENTS } from '../lib/contract/legal';
import { useCatalog } from '../lib/state/CatalogContext';
import { Logo } from './Logo';

/**
 * The footer's links, and the middle group is the site's internal linking.
 *
 * Everything on this site that narrows a catalogue was React state on `/styles`
 * — instant for a visitor, invisible to a crawler and worth nothing as a url. The
 * shelves under `/hairstyles` are those narrowings given real pages, and this is
 * where every page on the site links to them: a sitewide link is how link equity
 * reaches a page that is otherwise two clicks from the front door, and how a
 * crawler finds one without walking the sitemap.
 *
 * Four shelves rather than the thirty that exist. A footer listing every
 * collection is a link farm — it dilutes each link, and nobody reads it. These
 * four are the widest doors: two genders and the two textures the rest of the
 * industry serves worst.
 */
const GROUPS = [
  {
    heading: 'Try it on',
    links: [
      { href: '/', label: 'Upload a photo' },
      { href: '/styles', label: 'Browse the catalogue' },
      { href: '/looks', label: 'My looks' },
    ],
  },
  {
    heading: 'Hairstyles',
    links: [
      { href: '/hairstyles/men', label: "Men's hairstyles" },
      { href: '/hairstyles/women', label: "Women's hairstyles" },
      { href: '/hairstyles/curly-hair', label: 'Curly hairstyles' },
      { href: '/hairstyles/coily-hair', label: 'Coily hairstyles' },
      { href: '/hairstyles', label: 'Every shelf' },
    ],
  },
  {
    heading: 'Your account',
    links: [
      { href: '/account', label: 'Previews and packs' },
      { href: '/legal/privacy', label: 'Your photograph' },
    ],
  },
];

function SourceLine() {
  const { source, loading } = useCatalog();
  if (loading || !source) return null;

  const text =
    source === 'api'
      ? 'Live catalogue'
      : source === 'cache'
        ? 'Offline copy — showing the catalogue this browser saved earlier'
        : 'No catalogue service configured for this build';

  const tone = source === 'api' ? 'text-faint' : 'text-amber';
  return (
    <p className={`text-[11.5px] ${tone}`}>
      {text}
      {!hasApi ? ' · NEXT_PUBLIC_API_URL is unset' : ''}
      {/* Sign-in used to be named here too, and is not any more: it is a mailed
          code against the same API, so with a service configured it works, and
          a build with none has already said so on the line above. */}
      {/* Checkout used to be named here from a `NEXT_PUBLIC_STRIPE_*` key in
          this build, which was a guess about a setting on the API. It is the
          server's answer now and it is reported where it matters — on the packs
          themselves, in `<Pricing>`, rather than in a footer nobody reads while
          deciding to buy something. */}
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-canvas-raised/60">
      <div className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8 lg:px-12">
        {/* Five tracks on a laptop: the brand takes two, and the three link
            groups take one each. It was four when there were two groups. */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-3 max-w-[36ch] text-[13.5px] leading-relaxed text-muted">
              A virtual hairstyle try-on. Upload one photo, pick a cut, and see it on
              yourself before anybody picks up the scissors.
            </p>
          </div>

          {GROUPS.map((group) => (
            <div key={group.heading}>
              <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-faint">
                {group.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13.5px] text-ink-soft transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[12px] text-faint">
              © {new Date().getFullYear()} Roda Production. Every mannequin in the catalogue is
              AI-generated — no photographs of real people.
            </p>
            <SourceLine />
          </div>
          <nav aria-label="Legal" className="flex gap-5">
            {LEGAL_DOCUMENTS.map((document) => (
              <Link
                key={document.slug}
                href={`/legal/${document.slug}`}
                className="text-[12px] text-muted transition-colors hover:text-ink"
              >
                {document.title}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
