import Link from 'next/link';

import type { Qa } from '../../lib/seo';
import { Rule, Section } from '../ui';

/**
 * What the front page says after the product has finished saying it.
 *
 * ## This is not the landing page coming back
 *
 * The site opened on a hero, three explanatory sections, a privacy essay and a
 * closing call to action, with the try-on one click away behind a button, and
 * all of it was deleted for a good reason: Louvo does not have to argue before it
 * can demonstrate, so the upload box is the first thing on the page and the
 * argument for the product is the product. Nothing here changes that. The upload
 * box, the hero and the catalogue strip are untouched and still first; this
 * block is *under* them, after the visitor has either started or scrolled past
 * everything, where it costs a person nothing.
 *
 * ## Why it has to exist anyway
 *
 * `<TryOnFlow>` is a client component, so the html served for `/` was a
 * skeleton: no heading, no sentence, nothing. For a visitor that is invisible —
 * hydration is a few hundred milliseconds. For a search engine it is the whole
 * page, on the first pass, and it means the front door of a site whose ambition
 * is to rank for "hairstyle app" and "virtual haircut try-on" contained neither
 * phrase in a form anything could read without executing JavaScript.
 *
 * So: one heading that says what this is, three short sections that answer the
 * three questions the queries actually encode, and links into the catalogue. It
 * is written to be read — the failure mode of a block like this is a keyword
 * mattress nobody would ever scroll to, and the check is whether a person who
 * reached it would learn something true.
 *
 * ## Every sentence is a fact about this repository
 *
 * The same rule `src/lib/legal.ts` is written under. The photograph paragraph
 * describes the scrub asserted in `check-previews.mjs`; the free-previews
 * sentence describes `install_anchors`; the texture paragraph describes the
 * variant matrix. A change that makes one of these false has to edit this file
 * in the same commit — and the `FAQPage` in the page's graph quotes these
 * answers verbatim, so a drift here is a drift between what we tell a person and
 * what we tell a crawler.
 */

export const HOME_FAQ: Qa[] = [
  {
    question: 'How do I see what a haircut looks like on me?',
    answer:
      'Upload one clear, front-facing photograph, answer two questions about the hair in it, and ' +
      'pick a cut. Louvo generates a preview of you in that haircut in about a minute, and you can ' +
      'wipe between the before and the after.',
  },
  {
    question: 'Is Louvo free?',
    answer:
      'The first two previews are free and need no card and no account. Browsing the catalogue is ' +
      'always free. After that a preview costs a credit, bought in packs — there is no subscription.',
  },
  {
    question: 'Do you keep my photo?',
    answer:
      'No. It goes straight to a private bucket under a random key, is read once by the model, and ' +
      'is deleted the moment the job finishes, whether it succeeded or not. The finished preview is ' +
      'downloaded to your device and our copy is deleted too. It is never public and never used to ' +
      'train anything.',
  },
  {
    question: 'Does it work on curly, coily and afro-textured hair?',
    answer:
      'Yes. Every cut records which of the four hair types it is genuinely offered for, and each is ' +
      'shot separately on that texture — a cut that is not offered for your hair type is removed ' +
      'from the grid rather than shown to you wrongly.',
  },
  {
    question: 'Do I need to download an app?',
    answer:
      'No. The whole try-on runs in the browser — upload, preview, compare and share — with nothing ' +
      'to install and no account until you want your credits to survive a new phone.',
  },
  {
    question: 'Will the preview look like me?',
    answer:
      'The model is handed your photograph and the studio render of the exact cut you picked, and ' +
      'asked to change the hair and leave everything else alone. That is why the catalogue is shot ' +
      'at all: naming a haircut to an image model gets a generic version of it, different every time.',
  },
];

export function HomeSeo() {
  return (
    <Section className="pb-8 pt-4">
      <Rule />

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-20">
        <div className="max-w-[68ch]">
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.3rem)] leading-[1.1] tracking-[-0.018em]">
            A virtual hairstyle try-on that uses your own face
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
            Most hairstyle apps show you a haircut on somebody else and leave you to imagine the
            rest. Louvo edits your photograph: you upload one picture, pick a cut from a catalogue
            shot on a neutral mannequin at four angles, and get a preview of yourself wearing it —
            same face, same light, different hair. It takes about a minute, the first two are free,
            and there is nothing to install.
          </p>

          <h3 className="mt-10 text-[15px] font-semibold text-ink">How it works</h3>
          <ol className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-ink-soft">1. Upload a photo.</span> One clear,
              front-facing picture. It goes to a private bucket, is read once, and is deleted the
              moment the preview is finished.
            </li>
            <li>
              <span className="font-semibold text-ink-soft">2. Answer two questions.</span> Whose
              catalogue, and what your hair does. Both are about the person in the picture, which is
              why they are asked on every upload rather than remembered.
            </li>
            <li>
              <span className="font-semibold text-ink-soft">3. Pick a cut.</span> The catalogue is
              already narrowed to the two answers, and each cut is shown in your own texture rather
              than on straight hair with a note underneath.
            </li>
            <li>
              <span className="font-semibold text-ink-soft">4. See it on yourself.</span> Wipe
              between the before and the after, try the next cut, or share the result.
            </li>
          </ol>

          <h3 className="mt-10 text-[15px] font-semibold text-ink">
            Cut for every texture, not just straight hair
          </h3>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
            A haircut is not one thing across four hair types, and pretending otherwise is how most
            of these tools fail people with curls. Every cut in the catalogue records which of the
            four types it is genuinely offered for — an afro is not a type 1 haircut — and carries a
            separate studio render for each texture that reads differently. A cut that is not
            offered for your hair is taken out of the grid rather than shown to you in somebody
            else&rsquo;s.
          </p>

          <h3 className="mt-10 text-[15px] font-semibold text-ink">Questions</h3>
          <dl className="mt-5 space-y-6">
            {HOME_FAQ.map((entry) => (
              <div key={entry.question}>
                <dt className="text-[14.5px] font-semibold text-ink-soft">{entry.question}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-muted">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/*
          The shelves, as links.

          The front page's catalogue strip already draws every cut, and it draws
          them in a client component inside a marquee — which is right for a
          person and invisible to a first-pass crawler. These are the same
          shelves as text: the entry points into `/hairstyles`, which is where
          the site's internal linking actually starts.
        */}
        <nav aria-label="Browse hairstyles" className="lg:pt-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">
            Browse hairstyles
          </h2>
          <ul className="mt-5 space-y-3">
            {SHELVES.map((shelf) => (
              <li key={shelf.href}>
                <Link
                  href={shelf.href}
                  className="text-[14.5px] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
                >
                  {shelf.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-[13px] leading-relaxed text-faint">
            Every cut has its own page with four studio angles, the textures it is offered for, and
            a button that puts it on your photograph.
          </p>
        </nav>
      </div>
    </Section>
  );
}

/**
 * The shelves, by slug rather than by fetch.
 *
 * This is the one place on the site that names collections without asking the
 * catalogue, and it is deliberate: these six are a *navigation* decision — which
 * doors the front page opens — not a statement about what exists. Each slug is
 * built from a gender or a hair type, both of which are fixed dimensions of the
 * data model rather than rows somebody can publish, so there is nothing here
 * that a catalogue change can invalidate. A slug that stopped resolving would
 * 404 rather than render an empty grid, which is `dynamicParams = false` doing
 * its job.
 */
const SHELVES = [
  { href: '/hairstyles/men', label: "Men's hairstyles" },
  { href: '/hairstyles/women', label: "Women's hairstyles" },
  { href: '/hairstyles/curly-hair', label: 'Curly hairstyles' },
  { href: '/hairstyles/coily-hair', label: 'Coily and afro-textured hairstyles' },
  { href: '/hairstyles/straight-hair', label: 'Straight hairstyles' },
  { href: '/hairstyles', label: 'Every shelf, and every cut by name' },
];
