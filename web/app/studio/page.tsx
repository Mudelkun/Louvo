import { permanentRedirect } from 'next/navigation';

/**
 * The studio moved to the front door.
 *
 * There is one try-on surface now and it is `/`, because a site whose entire
 * proposition is "upload a photo and see the haircut" should not put that behind
 * a link on a page explaining it. This route stays as a redirect rather than a
 * deletion for the two link shapes already in the world: `/studio?style=…`,
 * which every style page minted before the change, and anything a visitor
 * bookmarked.
 *
 * The query string is carried over verbatim — it is the whole point of the
 * redirect, since `?style=` is the cut somebody chose and dropping it would land
 * them on an empty flow having already made the choice.
 */
export default async function StudioRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const query = params.toString();
  permanentRedirect(query ? `/?${query}` : '/');
}
