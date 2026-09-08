import type { Metadata } from 'next';

import { AccountPanel } from '../../components/AccountPanel';
import { Section } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Credit packs for Luvo previews. One payment, nothing renews.',
  robots: { index: false, follow: true },
};

/**
 * One column, centred, and narrow.
 *
 * Every other page here is a left-aligned reading measure inside the site's
 * 1240px frame, because every other page has something to scan — a grid, a cut,
 * a gallery. This one is three cards and a sentence, and a short shelf pinned to
 * the left margin of a wide screen reads as the top-left corner of a table that
 * never arrived. `text-center` is set once on the wrapper so the panel does not
 * have to repeat it on every child.
 *
 * There is no heading of this page's own: `<AccountPanel>` carries the `h1`,
 * because after the balance was cut the packs are the only thing here and a
 * title above them would be a second name for one section.
 */
export default function AccountPage() {
  return (
    <Section className="pb-24 pt-16 sm:pt-24">
      <div className="mx-auto w-full max-w-[880px] text-center">
        <AccountPanel />
      </div>
    </Section>
  );
}
