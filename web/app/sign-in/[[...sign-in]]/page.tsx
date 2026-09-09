import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthScreen, AuthScreenSkeleton } from '../../../components/auth/AuthScreen';

/**
 * `/sign-in`, and it is an optional catch-all rather than a plain route.
 *
 * Clerk's mounted card is not one screen: it has a verification step, a
 * factor-two step and the tail of an SSO round trip, and each of those is a
 * child path under this one (`/sign-in/factor-one`, `/sign-in/sso-callback`).
 * `[[...sign-in]]` is what makes them render here instead of 404ing — Clerk
 * documents exactly this shape, and a plain `page.tsx` fails only later, on the
 * step nobody tests first.
 *
 * Not indexed: a sign-in form is not a page a search result should land on, and
 * `robots.ts` disallows it as well. See the note there about doing both.
 */
export const metadata: Metadata = {
  title: 'Sign in — Louvo',
  description:
    'Sign in to Louvo so the previews you have paid for follow you between browsers and to the app.',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  // `useSearchParams` in `<AuthScreen>` — it reads `?next=` — would otherwise
  // opt this whole route out of the static render. Same pattern as `app/page.tsx`.
  return (
    <Suspense fallback={<AuthScreenSkeleton />}>
      <AuthScreen mode="sign-in" />
    </Suspense>
  );
}
