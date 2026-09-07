import type { Metadata } from 'next';

import { LooksGallery } from '../../components/LooksGallery';
import { Section } from '../../components/ui';

export const metadata: Metadata = {
  title: 'My looks',
  description: 'The previews you have generated and the cuts you have saved.',
  // Everything on this page is stored in one browser, so a crawler would index
  // a page that is empty for every visitor but its owner.
  robots: { index: false, follow: true },
};

export default function LooksPage() {
  return (
    <Section className="pb-24 pt-12 sm:pt-16">
      <LooksGallery />
    </Section>
  );
}
