/**
 * A legal document, read inside the app.
 *
 * ## Why it is a screen rather than a link to the website
 *
 * The same text is served publicly at `/privacy` and `/terms` — both stores
 * require a url a reviewer can open without installing anything — and it would
 * have been a smaller change to point `Linking.openURL` at it. Three things make
 * the screen worth having:
 *
 * - **It works with no network.** The one moment somebody actually reads a
 *   privacy policy is the moment they are deciding whether to hand over a
 *   photograph of their face, and a spinner over a browser is the wrong answer
 *   there.
 * - **A build with no API still has one.** `EXPO_PUBLIC_API_URL` is what makes
 *   the public page exist; a checkout without it would have had links that lead
 *   nowhere, which is worse than no links.
 * - **Leaving the app to read the terms loses the flow.** From the paywall, in
 *   particular, a browser hand-off is a purchase abandoned.
 *
 * The document is data (`src/lib/legal.ts`) and this file only knows how to draw
 * three kinds of block, so a new clause is an edit to the prose and nothing
 * here changes.
 */

import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Header, Screen } from '@/components/Screen';
import { legalDocument, type LegalBlock } from '@/lib/legal';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

export default function LegalScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = legalDocument(String(doc ?? ''));

  if (!document) {
    return (
      <Screen padded={false}>
        <Header title="Not found" />
        <View style={styles.body}>
          <Text style={[type.body, { color: colors.muted }]}>
            That document does not exist. Both of ours are linked from Settings.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Header title={document.title} />
      <View style={styles.body}>
        <Text style={[type.body, { color: colors.inkSoft }]}>{document.summary}</Text>
        {/* The date is the one thing on the page that tells a returning reader
            whether anything has changed, so it sits above the prose rather than
            in a footer nobody scrolls to. */}
        <Text style={[type.caption, { color: colors.muted }]}>Effective {document.effective}</Text>

        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={[type.heading, { color: colors.ink }]}>{section.heading}</Text>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

/** The three shapes a block can take, and the whole of this renderer. */
function Block({ block }: { block: LegalBlock }) {
  const styles = useStyles();
  const colors = useColors();

  if (block.kind === 'p') {
    return <Text style={[type.body, { color: colors.inkSoft }]}>{block.text}</Text>;
  }

  if (block.kind === 'list') {
    return (
      <View style={{ gap: spacing.sm }}>
        {block.items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={[type.body, { color: colors.inkSoft, flex: 1 }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }

  // Term and detail. Drawn as a card per row rather than as a two-column table:
  // the details are whole sentences, and a column narrow enough for the terms is
  // a column too narrow for those on a phone.
  return (
    <View style={{ gap: spacing.md }}>
      {block.rows.map((row) => (
        <View key={row.term} style={styles.row}>
          <Text style={[type.bodyStrong, { color: colors.ink }]}>{row.term}</Text>
          <Text style={[type.body, { color: colors.inkSoft }]}>{row.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingTop: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.lg },
  section: { gap: spacing.md, marginTop: spacing.lg },
  bulletRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  // Nudged down to sit on the first line's centre rather than its cap height.
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 9,
    backgroundColor: colors.accent,
  },
  row: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
}));
