import Link from 'next/link';

import type { Category, HairLength, HairType, Hairstyle } from '../../lib/contract/catalog';
import { supportsHairType } from '../../lib/hairTypes';
import type { Qa } from '../../lib/seo';
import { Rule } from '../ui';

/**
 * What the page says about the cut, in words, in the document.
 *
 * ## Why prose is back on this page, and why it is down here
 *
 * `<StyleDetail>` deliberately has no description in it, and that decision
 * stands: a paragraph, a "Suits" line and a tag row used to sit *between* the
 * picture and the two controls that change it, about two hundred points of
 * reading that pushed the length slider off the bottom of a phone — and four
 * studio angles of the cut in your own texture say more about what it is than
 * three sentences do. The argument was about **position**, not about existence:
 * the words were in the way of the decision being made above them.
 *
 * They were also the only text on the page. A style page shipped a name, an
 * upkeep word and a picture, which as a search result is a url with nothing to
 * match a query against — and these fifty-odd pages are the entire reason a web
 * build exists before an app store. So the prose is restored *below* everything
 * the decision is made with: under the plate, under the controls, under the
 * button that spends a credit, at the point somebody is either reading or gone.
 * Nothing above the fold moved.
 *
 * ## It renders on the server
 *
 * `<StyleDetail>` is a client component reading the catalogue from a context, so
 * everything it draws — the name included — exists only after hydration. This
 * block is handed its data by the route, which fetched it, so the cut's name,
 * its description and every link out of it are in the html a crawler is served
 * on the first pass rather than on whichever later one it gets round to.
 *
 * ## Every fact here is a catalogue field
 *
 * There is no hairstyle name and no category name in this file. The specs are
 * rows, the questions are composed from rows, and a cut published tomorrow gets
 * the same block with no edit here — the constraint the whole site is written
 * under, applied to the one place it would have been easiest to break.
 */

const GENDER_WORD: Record<string, string> = { male: "men's", female: "women's" };

export interface StyleAboutProps {
  style: Hairstyle;
  categories: Category[];
  hairTypes: HairType[];
  hairLengths: HairLength[];
}

/** The textures this cut is genuinely offered for, as catalogue rows. */
export const offeredTypes = (style: Hairstyle, hairTypes: HairType[]): HairType[] =>
  hairTypes.filter((type) => supportsHairType(style, type.id));

/** The lengths it is offered at, across both genders, in catalogue order. */
export const offeredLengths = (style: Hairstyle, hairLengths: HairLength[]): HairLength[] => {
  const ids = new Set(Object.values(style.lengths ?? {}).flat());
  return hairLengths.filter((length) => ids.has(length.id));
};

/**
 * The questions this cut answers, composed from its own row.
 *
 * They are the long-tail queries a haircut actually attracts — "is it offered
 * for curly hair", "what does it look like from the back", "how much upkeep is
 * it" — and each answer is a fact this page can prove. A question the row cannot
 * answer is simply not asked: a cut with no length offer gets no length
 * question, rather than a paragraph explaining that it has none.
 */
export function styleFaq(
  style: Hairstyle,
  hairTypes: HairType[],
  hairLengths: HairLength[],
): Qa[] {
  const types = offeredTypes(style, hairTypes);
  const lengths = offeredLengths(style, hairLengths);
  const audience =
    style.genders.length === 2
      ? "men and women"
      : style.genders[0] === 'male'
        ? 'men'
        : 'women';

  const entries: Qa[] = [
    {
      question: `Can I see the ${style.name} on my own photo?`,
      answer:
        `Yes. Upload one clear, front-facing photograph and Louvo generates a preview of you in ` +
        `the ${style.name} in about a minute. The first two previews are free and need no account.`,
    },
    {
      question: `What hair types is the ${style.name} offered for?`,
      answer: types.length
        ? `${types.map((type) => type.name.toLowerCase()).join(', ')} hair — ` +
          `${types.map((type) => type.tier.toLowerCase()).join(', ')}. ` +
          `Each is a separate studio render rather than one picture with a note under it, so what you see ` +
          `is the cut on that texture.`
        : `The ${style.name} is shot in a single render that serves every hair type.`,
    },
    {
      question: `How much upkeep is a ${style.name}?`,
      answer:
        `${style.maintenance} upkeep${style.bestFor.length ? `. It suits ${joinWords(style.bestFor).toLowerCase()}` : ''}. ` +
        `It is a ${audience === 'men and women' ? "men's and women's" : `${GENDER_WORD[style.genders[0]]}`} cut in the Louvo catalogue.`,
    },
    {
      question: `What does the ${style.name} look like from the back?`,
      answer:
        `Every cut in the catalogue is shot at four angles on the same neutral mannequin — front, ` +
        `three-quarter, side and back — so the back of the ${style.name} is one swipe from the front of it ` +
        `on the page above.`,
    },
  ];

  if (lengths.length > 1) {
    entries.push({
      question: `Can the ${style.name} be worn shorter or longer?`,
      answer:
        `It is offered at ${joinWords(lengths.map((length) => length.name.toLowerCase()))}, and the slider on ` +
        `this page shows each one as its own studio render rather than as the same picture relabelled. ` +
        `The preview is generated at whichever length is selected.`,
    });
  }

  return entries;
}

/** "a, b and c" — the Oxford-free join a sentence wants. */
const joinWords = (parts: string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

export function StyleAbout({ style, categories, hairTypes, hairLengths }: StyleAboutProps) {
  const types = offeredTypes(style, hairTypes);
  const lengths = offeredLengths(style, hairLengths);
  const named = categories.filter((category) => style.categoryIds.includes(category.id));
  const faq = styleFaq(style, hairTypes, hairLengths);

  return (
    <section className="mt-14" aria-labelledby="about-this-cut">
      <Rule />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-16">
        <div className="max-w-[68ch]">
          <h2
            id="about-this-cut"
            className="font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight tracking-[-0.015em]"
          >
            About the {style.name}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{style.description}</p>

          {style.bestFor.length ? (
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
              <span className="font-semibold text-ink-soft">Suits</span>{' '}
              {joinWords(style.bestFor).toLowerCase()}.
            </p>
          ) : null}

          {/* The questions, written out — the `FAQPage` in the route's graph
              describes this list and nothing else. */}
          <dl className="mt-9 space-y-6">
            {faq.map((entry) => (
              <div key={entry.question}>
                <dt className="text-[14.5px] font-semibold text-ink">{entry.question}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-muted">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* The specification, and every row of it is a link out          */}
        {/* ------------------------------------------------------------ */}
        {/*
          This is the page's contribution to the shape of the site. A style page
          is a leaf: everything points at it and, until this block, nothing
          pointed out of it except a shelf of four suggestions. Each fact about
          the cut is also a collection that exists — its category, its gender,
          each texture it is offered for — so stating the fact and linking it are
          the same gesture, and a crawler arriving on one haircut can reach the
          shelf it belongs to rather than the sitemap.
        */}
        <dl className="space-y-5 rounded-[20px] bg-surface/60 p-6 ring-1 ring-inset ring-line">
          <Row label="Upkeep">{style.maintenance}</Row>

          <Row label="Offered for">
            <span className="flex flex-wrap gap-x-3 gap-y-1.5">
              {style.genders.map((gender) => (
                <Facet
                  key={gender}
                  href={`/hairstyles/${gender === 'male' ? 'men' : 'women'}`}
                  label={GENDER_WORD[gender]}
                />
              ))}
            </span>
          </Row>

          {types.length ? (
            <Row label="Hair types">
              <span className="flex flex-wrap gap-x-3 gap-y-1.5">
                {types.map((type) => (
                  <Facet
                    key={type.id}
                    href={`/hairstyles/${type.id}-hair`}
                    label={type.name.toLowerCase()}
                  />
                ))}
              </span>
            </Row>
          ) : null}

          {named.length ? (
            <Row label="In">
              <span className="flex flex-wrap gap-x-3 gap-y-1.5">
                {named.map((category) => (
                  <Facet
                    key={category.id}
                    href={`/hairstyles/${category.id}`}
                    label={category.name.toLowerCase()}
                  />
                ))}
              </span>
            </Row>
          ) : null}

          {lengths.length > 1 ? (
            <Row label="Lengths">{joinWords(lengths.map((length) => length.name.toLowerCase()))}</Row>
          ) : null}

          {style.tags.length ? (
            <Row label="Tags">{style.tags.join(', ')}</Row>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-4">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="text-[14px] text-ink-soft">{children}</dd>
    </div>
  );
}

function Facet({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="underline decoration-line underline-offset-4 transition-colors hover:text-violet-ink hover:decoration-violet"
    >
      {label}
    </Link>
  );
}
