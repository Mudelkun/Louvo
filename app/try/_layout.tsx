import { Stack } from 'expo-router';
import React from 'react';

import { colors } from '@/theme/theme';

/** The try-on flow: photo → gender → hair type → browse → style → result.
 *  Hair type is asked up front because it decides which styles exist, not just
 *  which of them are shown; category is not asked at all — it is a chip row over
 *  the catalog grid. Generation itself is queued in the background, so there is
 *  no waiting screen. */
export default function TryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="result" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
