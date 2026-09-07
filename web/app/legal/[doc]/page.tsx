import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { Overline, Section } from '../../../components/ui';
import { LEGAL_DOCUMENTS, legalDocument, type LegalBlock } from '../../../lib/contract/legal';

/**
 * The Privacy Policy and the Terms of Use, rendered from the same words the app
 * shows and the API serves.
 *
 * `lib/contract/legal.ts` is generated from `src/lib/legal.ts` by
 * `scripts/sync-contract.mjs`, for the reason that script exists: two copies of
 * a privacy policy that have drifted apart are two different promises about
 * somebody's photograph. **Edit the app's file, never the generated one.**
 *
 * They are pages here rather than links out to the API's `/privacy` for the same
 * reason they are screens in the app: the moment anybody reads a privacy policy
 * is the moment they are deciding whether to hand over a photograph of their
 * face, so it must not depend on a service being reachable — and a build with no
 * API url has no public page to link to at all.
 */

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ doc: document.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const document = legalDocument(doc);
  if (!document) return {};
  return {
    title: document.title,
    description: document.summary,
    alternates: { canonical: `/legal/${document.slug}` },
  };
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') {
    return <p className="mt-4 text-[14.5px] leading-[1.75] text-ink-soft">{block.text}</p>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="mt-4 space-y-2.5">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-3 text-[14.5px] leading-[1.7] text-ink-soft">
            <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-violet" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="mt-5 grid gap-px overflow-hidden rounded-[16px] bg-line">
      {block.rows.map((row, index) => (
        <div key={index} className="bg-surface/60 p-4 sm:flex sm:gap-6 sm:p-5">
          <dt className="text-[13.5px] font-bold text-ink sm:w-[34%] sm:shrink-0">{row.term}</dt>
          <dd className="mt-1 text-[13.5px] leading-relaxed text-muted sm:mt-0">{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const document = legalDocument(doc);
  if (!document) notFound();

  const other = LEGAL_DOCUMENTS.find((entry) => entry.slug !== document.slug);

  return (
    <Section className="pb-24 pt-12 sm:pt-16">
      <div className="mx-auto max-w-[720px]">
        <header>
          <Overline>Legal</Overline>
          <h1 className="mt-4 font-display text-[clamp(2.2rem,5vw,3.2rem)] leading-[1.04] tracking-[-0.02em]">
            {document.title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{document.summary}</p>
          <p className="mt-4 text-[12.5px] text-faint">Effective {document.effective}</p>
        </header>

        {/* A table of contents, because these are long and somebody arriving
            from a specific question should be able to reach it. */}
        <nav aria-label="Sections" className="mt-10 rounded-[18px] bg-surface/50 p-5 ring-1 ring-inset ring-line">
          <ol className="grid gap-2 sm:grid-cols-2">
            {document.sections.map((section, index) => (
              <li key={index}>
                <a
                  href={`#section-${index}`}
                  className="text-[13px] text-ink-soft transition-colors hover:text-violet-ink"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12">
          {document.sections.map((section, index) => (
            <section key={index} id={`section-${index}`} className="scroll-mt-24 pt-10 first:pt-0">
              <h2 className="font-display text-[clamp(1.4rem,3vw,1.9rem)] leading-tight text-ink">
                {section.heading}
              </h2>
              {section.blocks.map((block, position) => (
                <Block key={position} block={block} />
              ))}
            </section>
          ))}
        </div>

        {other ? (
          <div className="mt-16 border-t border-line pt-8">
            <Link href={`/legal/${other.slug}`} className="text-[14px] font-semibold text-violet-ink">
              Read the {other.title} →
            </Link>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
