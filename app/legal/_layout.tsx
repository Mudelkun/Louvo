import { Stack } from 'expo-router';
import React from 'react';

import { useColors } from '@/theme/theme';

/**
 * The two legal documents, as screens.
 *
 * A directory with its own layout rather than a single route, for the same
 * reason `app/try/` has one: the root navigator declares `legal` and the
 * documents are its children, so a link anywhere in the app is `/legal/privacy`
 * or `/legal/terms` and matches the public urls the same text is served at.
 */
export default function LegalLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
