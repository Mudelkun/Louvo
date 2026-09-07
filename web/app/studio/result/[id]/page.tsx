import { LookView } from '../../../../components/LookView';
import { Section } from '../../../../components/ui';

export const metadata = {
  title: 'Your preview',
  // Not indexable: the route names a look that exists only in one browser, so a
  // crawler would index a page that renders "not on this device" for everybody.
  robots: { index: false, follow: false },
};

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Section className="pb-24 pt-6 sm:pt-16">
      <LookView id={id} />
    </Section>
  );
}
