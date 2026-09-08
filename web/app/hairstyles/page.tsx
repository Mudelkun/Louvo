import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs } from '../../components/seo/Breadcrumbs';
import { JsonLd } from '../../components/seo/JsonLd';
import { ButtonLink, Rule, Section } from '../../components/ui';
import { loadCatalog } from '../../lib/catalogServer';
import { allCollections } from '../../lib/collections';
import {
  abs,
  breadcrumbLd,
  faqLd,
  graph,
  itemListLd,
  og,
  ORG_ID,
  SITE_ID,
  tw,
  type Qa,
} from '../../lib/seo';

/**
 * The index — every collection and every haircut, as plain links.
 *
 * `/styles` is the catalogue somebody *uses*: a rail, a search box, cards that
 * cycle through their textures. This is the catalogue somebody *reaches*, and
 * the two are not the same job. Three things only this page does:
 *
 * **It is the one page that links to every cut.** The site's internal linking
 * ran through a client-rendered grid, so before hydration there was no path from
 * anywhere to any hairstyle — a crawler arriving on the front page found the
 * sitemap and nothing else, and a sitemap is a hint about what exists rather
 * than a statement about what matters. Fifty-odd links in one document, grouped
 * and captioned, is how the catalogue's shape becomes something a crawler can
 * read and how link equity actually reaches a leaf.
 *
 * **It is where the questions are answered in words.** The front page is the
 * product and stays the product — no explanation was put back in front of the
 * upload box. But "how does it work", "is my photo kept", "does it work on curly
 * hair" are real queries with real volume, and a site that answers them nowhere
 * is a site with no claim on them. They are answered here, under the index,
 * where somebody browsing is plausibly reading and somebody who came to try a
 * haircut never has to see them.
 *
 * **It is static.** No context, no `useSearchParams`, nothing deferred out of
 * the render. The whole document is html.
 */
export const revalidate = 3600;

const TRAIL = [
  { name: 'Home', path: '/' },
  { name: 'Hairstyles', path: '/hairstyles' },
];

const TITLE = 'Hairstyles — every cut you can try on your own photo';
const DESCRIPTION =
  "Every haircut in the Luvo catalogue, by texture, length and gender — men's and " +
  "women's, straight to coily. Pick one, upload a photo, and see it on your own face.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/hairstyles' },
  openGraph: og({ path: '/hairstyles', title: TITLE, description: DESCRIPTION }),
  twitter: tw({ title: TITLE, description: DESCRIPTION }),
};

/**
 * The questions, and every answer here is a fact about this repository.
 *
 * That is the same rule `src/lib/legal.ts` is written under and it is not
 * decoration: an answer about what happens to a photograph is a privacy claim,
 * and the moment one of these stops describing what the code does it has to be
 * edited in the same commit. The photograph answer is the scrub in
 * `check-previews.mjs`; the free-previews answer is `install_anchors` in
 * `docs/credits.md`; the texture answer is the variant matrix.
 */
const FAQ: Qa[] = [
  {
    question: 'How do I try on a hairstyle with a photo?',
    answer:
      'Upload one clear, front-facing photograph, answer two questions about the hair in it, ' +
      'and pick a cut from the catalogue. The preview takes about a minute and shows you in ' +
      'that haircut, in your own photograph, with everything else left alone.',
  },
  {
    question: 'Is it free to try a haircut on?',
    answer:
      'The first two previews are free and need no card and no account. After that a preview ' +
      'costs a credit, bought in packs. Browsing the whole catalogue is always free.',
  },
  {
    question: 'What happens to my photograph?',
    answer:
      'It goes straight to a private bucket under a random key, is read once by the model, and ' +
      'is deleted the moment the job finishes — successfully or not. The finished preview is ' +
      'downloaded to your own device and our copy is then deleted too. It is never public, ' +
      'never in a database and never used to train anything.',
  },
  {
    question: 'Does it work on curly and coily hair?',
    answer:
      'Yes, and that is what the two questions at the start are for. Every cut in the catalogue ' +
      'records which of the four hair types it is genuinely offered for, and each one is shown ' +
      'in the texture you declared rather than on straight hair with a note underneath. A cut ' +
      'that is not offered for your texture is removed from the grid rather than shown wrongly.',
  },
  {
    question: 'Does the preview actually look like me?',
    answer:
      'The photograph is edited rather than redrawn from a description: the model is handed your ' +
      'picture and the studio render of the exact cut you chose, and asked to change the hair and ' +
      'leave everything else. That is why the catalogue is shot at all — naming a haircut gets a ' +
      'generic version of it, and a different one every time.',
  },
  {
    question: 'Do I need to install an app?',
    answer:
      'No. The whole try-on runs in this browser — upload, preview, compare and share — with ' +
      'nothing to install and no account until you want your credits to survive a new phone.',
  },
];

export default async function HairstylesIndex() {
  const catalog = await loadCatalog();
  const collections = catalog ? allCollections(catalog.hairstyles, catalog) : [];
  const styles = catalog ? [...catalog.hairstyles].sort((a, b) => a.name.localeCompare(b.name)) : [];

  const byGender = (gender: 'male' | 'female' | null) =>
    collections.filter((entry) => entry.gender === gender);

  return (
    <Section className="pb-24 pt-6 sm:pt-10">
      <JsonLd
        data={graph(
          {
            '@type': 'CollectionPage',
            '@id': abs('/hairstyles#page'),
            url: abs('/hairstyles'),
            name: 'Hairstyles',
            description: DESCRIPTION,
            isPartOf: { '@id': SITE_ID },
            publisher: { '@id': ORG_ID },
            inLanguage: 'en',
          },
          breadcrumbLd(TRAIL),
          styles.length ? itemListLd(styles, 'Every hairstyle in the Luvo catalogue') : null,
          faqLd(FAQ),
        )}
      />

      <Breadcrumbs trail={TRAIL} className="mb-6" />

      <header className="max-w-[64ch]">
        <h1 className="font-display text-[clamp(2.1rem,5vw,3.1rem)] leading-[1.03] tracking-[-0.02em]">
          Hairstyles
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Every cut Luvo can put on you, shot the same way — one neutral mannequin, one light,
          four angles — and rendered for straight, wavy, curly and coily hair rather than for
          one of them. Pick a shelf below, or upload a photograph and start from your own face.
        </p>
        <div className="mt-7">
          <ButtonLink href="/">Try a haircut on your photo</ButtonLink>
        </div>
      </header>

      <Rule className="mt-12" />

      {/* ---------------------------------------------------------------- */}
      {/* The shelves                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <Shelf heading="By texture, length and shape" entries={byGender(null)} />
        <Shelf heading="Men's hairstyles" entries={byGender('male')} />
        <Shelf heading="Women's hairstyles" entries={byGender('female')} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Every cut, by name                                                */}
      {/* ---------------------------------------------------------------- */}
      {styles.length ? (
        <>
          <Rule className="mt-14" />
          <section className="mt-10">
            <h2 className="font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight tracking-[-0.015em]">
              Every cut, A to Z
            </h2>
            <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {styles.map((style) => (
                <li key={style.id}>
                  <Link
                    href={`/styles/${style.id}`}
                    className="text-[14px] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
                  >
                    {style.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* The questions                                                     */}
      {/* ---------------------------------------------------------------- */}
      <Rule className="mt-14" />
      <section className="mt-10 max-w-[70ch]">
        <h2 className="font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight tracking-[-0.015em]">
          Questions
        </h2>
        <dl className="mt-7 space-y-7">
          {FAQ.map((entry) => (
            <div key={entry.question}>
              <dt className="text-[15px] font-semibold text-ink">{entry.question}</dt>
              <dd className="mt-2 text-[14.5px] leading-relaxed text-muted">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Section>
  );
}

function Shelf({
  heading,
  entries,
}: {
  heading: string;
  entries: { slug: string; heading: string }[];
}) {
  if (!entries.length) return null;
  return (
    <nav aria-label={heading}>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">{heading}</h2>
      <ul className="mt-4 space-y-2.5">
        {entries.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/hairstyles/${entry.slug}`}
              className="text-[14px] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
            >
              {entry.heading}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
