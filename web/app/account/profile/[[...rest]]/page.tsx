import type { Metadata } from 'next';

import { ProfileScreen } from '../../../../components/auth/ProfileScreen';

/**
 * Clerk's own account screen, on a route of ours.
 *
 * An optional catch-all for the same reason `/sign-in` is: `<UserProfile />` is
 * a set of pages — security, connected accounts, adding an email — and each is a
 * child path under this one.
 *
 * It is a page rather than `openUserProfile()` for the reason sign-in stopped
 * being a modal: one kind of surface for one kind of errand. The credit balance
 * is deliberately not in here — that is Luvo's and it is on `/account`, which is
 * one link away at the top of this page.
 */
export const metadata: Metadata = {
  title: 'Your profile — Luvo',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
