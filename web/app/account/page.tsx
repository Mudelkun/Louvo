import type { Metadata } from 'next';

import { AccountPanel } from '../../components/AccountPanel';
import { Overline, Section } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Your preview balance, the credit packs, and exactly what this browser is keeping.',
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <Section className="pb-24 pt-12 sm:pt-16">
      <header className="mb-10 max-w-[46ch]">
        <Overline>Account</Overline>
        <h1 className="mt-4 font-display text-[clamp(2.4rem,5.5vw,3.6rem)] leading-[1.02] tracking-[-0.02em]">
          Your previews.
        </h1>
      </header>
      <div className="max-w-[880px]">
        <AccountPanel />
      </div>
    </Section>
  );
}
