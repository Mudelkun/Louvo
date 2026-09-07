import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { API_URL } from '../../../lib/config';

/**
 * A followed share link.
 *
 * The API already serves `/s/:code` as a landing page for the *phone* app —
 * it deep-links into the app if it is installed and offers the store buttons if
 * it is not. On the web there is nothing to install, so the honest destination
 * is the hairstyle itself, and this route is one hop: resolve the code, redirect
 * to the style page, record the open.
 *
 * **The picture never comes back to us.** A share link names a hairstyle, so
 * what a scraper renders into a chat card is the catalogue's own mannequin
 * render of that cut — public, CDN-hosted, identical for everybody who shared
 * it. The metadata below is therefore generated from the *style page's* data, by
 * redirecting to it; there is nothing here that could accidentally expose a
 * user's preview because there is nothing here that knows about one.
 */

interface ShareResponse {
  share: {
    code: string;
    hairstyleId: string;
    hairstyleName: string;
    gender: string | null;
    hairType: string | null;
    lengthId: string | null;
    imageUrl: string | null;
  };
}

async function resolve(code: string): Promise<ShareResponse['share'] | null> {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}/v1/shares/${encodeURIComponent(code)}`, {
      // Short, because a link is followed within minutes of being sent and the
      // row it points at never changes after it is written.
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return ((await response.json()) as ShareResponse).share;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const share = await resolve(code);
  if (!share) return { title: 'Shared look', robots: { index: false } };

  return {
    title: share.hairstyleName,
    description: `${share.hairstyleName} on Luvo — see it on yourself before the chair.`,
    openGraph: {
      title: `${share.hairstyleName} · Luvo`,
      description: 'See it on yourself before the chair.',
      ...(share.imageUrl ? { images: [{ url: share.imageUrl }] } : {}),
    },
    robots: { index: false, follow: true },
  };
}

export default async function SharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await resolve(code);

  // An unknown code goes to the catalogue rather than to a 404: somebody who
  // followed a link from a friend should land somewhere useful, and a dead link
  // is our problem rather than theirs.
  if (!share) redirect('/styles');

  const query = new URLSearchParams({ ref: code });
  if (share.gender) query.set('gender', share.gender);
  if (share.hairType) query.set('hairType', share.hairType);
  redirect(`/styles/${share.hairstyleId}?${query.toString()}`);
}
