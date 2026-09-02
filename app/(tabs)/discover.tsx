import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { colors, spacing, type } from '@/theme/theme';

/**
 * Discover — placeholder. The tab exists so the shell is navigable; the browsing
 * surface that fills it is not designed yet.
 */
export default function DiscoverTab() {
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, gap: spacing.sm }}>
        <Text style={[type.title, { color: colors.ink }]}>Discover</Text>
        <Text style={[type.body, { color: colors.muted }]}>Coming soon.</Text>
      </View>
    </Screen>
  );
}
