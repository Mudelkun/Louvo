import type { Metadata } from 'next';

import { StyleDetail } from '../../../components/StyleDetail';
import { Section } from '../../../components/ui';
import { API_URL } from '../../../lib/config';
import type { CatalogResponse } from '../../../lib/contract/catalog';

/**
 * The one page that fetches on the server as well as on the client.
 *
 * Not for rendering — the page itself is a client component, because it holds
 * the visitor's declared gender and texture and those live in a context. This
 * fetch is for the **metadata**: a shared link has to unfurl into a chat card
 * with the cut's real name and the catalogue's own render of it, and a card
 * generated from an empty client tree says "Luvo" and shows nothing.
 *
 * It is deliberately the *hero render*, which is public, CDN-hosted and
 * identical for everybody who ever shares this cut. Never a user's preview.
 */
async function loadStyle(id: string) {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}/v1/hairstyles/${encodeURIComponent(id)}`, {
      // The catalogue changes only when somebody runs a publish, so an hour of
      // staleness on a social card is a trade worth making against a fetch on
      // every crawl of every style page.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      hairstyle: CatalogResponse['hairstyles'][number];
      renders: CatalogResponse['renders'][string];
    };
  } catch {
    return null;
  }
}

/** The first render in the manifest slice, whatever variant it is. */
function anyRender(renders: CatalogResponse['renders'][string] | undefined): string | null {
  for (const byLength of Object.values(renders ?? {})) {
    for (const byGender of Object.values(byLength ?? {})) {
      for (const byAngle of Object.values(byGender ?? {})) {
        for (const ref of Object.values(byAngle ?? {})) {
          if (ref?.url) return ref.url;
        }
      }
    }
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadStyle(id);
  if (!data) return { title: 'Hairstyle' };

  const image = anyRender(data.renders);
  return {
    title: data.hairstyle.name,
    description: data.hairstyle.description,
    openGraph: {
      title: `${data.hairstyle.name} · Luvo`,
      description: data.hairstyle.description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

/**
 * The three answers are read here rather than with `useSearchParams` inside the
 * component.
 *
 * `length` closes the one round trip the try-on has: a style page with no
 * photograph sends somebody to `/?style=…&length=…`, and when the flow is done
 * it sends them back here — so the length they had chosen has to survive the
 * trip.
 *
 * `gender` and `hairType` are what every grid on the site already mints into its
 * card links, and what the result page mints into the link back to the cut it
 * just put on somebody. They are the answers the *picture they clicked* was
 * drawn with, so this page has to open on them rather than on whatever is stored
 * — a card showing one texture that opens a page showing another is the
 * wrong-image failure the variant system exists to prevent. `StyleDetail` adopts
 * them into the session once, through `useAdoptedAnswers`.
 *
 * A server component is already handed its search params, which costs no hook,
 * no Suspense boundary and no second render.
 */
const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

export default async function StylePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { length, gender, hairType } = await searchParams;
  return (
    <Section className="pb-24 pt-3 sm:pt-14">
      <StyleDetail
        styleId={id}
        length={one(length)}
        gender={one(gender)}
        hairType={one(hairType)}
      />
    </Section>
  );
}
