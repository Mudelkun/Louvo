import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuthScreen, AuthScreenSkeleton } from '../../../components/auth/AuthScreen';

/** `/sign-up`. The catch-all and the robots rule are `/sign-in`'s — see there. */
export const metadata: Metadata = {
  title: 'Create your Luvo account',
  description:
    'Create a Luvo account so the previews you buy are not lost with a browser. Signing up adds a free preview.',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthScreenSkeleton />}>
      <AuthScreen mode="sign-up" />
    </Suspense>
  );
}
