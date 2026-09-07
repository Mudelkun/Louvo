/**
 * The line that says which documents apply, wherever it has to be said.
 *
 * Four places need it and they need it in three registers: the welcome screen,
 * where somebody is about to start; the sign-in screen and the paywall, where
 * they are about to create an account and spend money; and Settings, where they
 * have gone looking for it. One component rather than four hand-written
 * sentences, because the thing that goes wrong with these lines is that one of
 * them stops linking somewhere after a route changes and nobody notices —
 * a legal notice with a dead link is a legal notice that was not given.
 *
 * The links are `<Text>` inside a `<Text>`, not buttons. A row of buttons under
 * a call to action competes with it; a sentence with two underlined words in it
 * reads as small print, which is what this is and what it should look like.
 * `hitSlop` is not available on nested text, so the touch target comes from the
 * line height and the words being at the end of the sentence rather than
 * mid-paragraph.
 */

import { Link } from 'expo-router';
import React from 'react';
import { Text, type TextStyle } from 'react-native';

import { PRIVACY_POLICY, TERMS_OF_USE } from '@/lib/legal';
import { spacing, useColors, type } from '@/theme/theme';

type Tone = 'light' | 'dark';

interface LegalLinksProps {
  /**
   * What the sentence is doing.
   *
   * `agree` is the consent notice shown before an irreversible-ish step —
   * starting the flow, making an account, buying. `plain` is the same two links
   * with no claim attached, for a screen that is only offering them.
   */
  variant?: 'agree' | 'plain';
  /** The verb the agreement is attached to: "continuing", "buying generations". */
  action?: string;
  /** `dark` for the welcome hero and anything else drawn on `stage`. */
  tone?: Tone;
  align?: TextStyle['textAlign'];
}

export function LegalLinks({
  variant = 'agree',
  action = 'continuing',
  tone = 'light',
  align = 'center',
}: LegalLinksProps) {
  const colors = useColors();
  // `onDark`/`onDarkMuted` rather than the canvas pair, because the welcome
  // hero is dark in both schemes — see the theming note in CLAUDE.md.
  const muted = tone === 'dark' ? colors.onDarkMuted : colors.muted;
  const link = tone === 'dark' ? colors.onDark : colors.accentInk;

  const terms = (
    <Link href="/legal/terms" style={{ color: link, fontWeight: '700' }}>
      {TERMS_OF_USE.title}
    </Link>
  );
  const privacy = (
    <Link href="/legal/privacy" style={{ color: link, fontWeight: '700' }}>
      {PRIVACY_POLICY.title}
    </Link>
  );

  return (
    <Text style={[type.caption, { color: muted, textAlign: align, marginTop: spacing.md }]}>
      {variant === 'agree' ? (
        <>
          By {action} you agree to our {terms} and {privacy}.
        </>
      ) : (
        <>
          {terms} · {privacy}
        </>
      )}
    </Text>
  );
}
