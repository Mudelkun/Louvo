import { Stack } from 'expo-router';
import React from 'react';

import { useColors } from '@/theme/theme';

/** The try-on flow: photo → gender → hair type → browse → style → generating →
 *  result. Hair type is asked up front because it decides which styles exist,
 *  not just which of them are shown; category is not asked at all — it is a chip
 *  row over the catalog grid.
 *
 *  The guided first run walks the same screens in a different order — gender →
 *  hair type → photo → browse → style — and adds one of its own, `notify`. There
 *  is no second copy of anything: `OnboardingContext` explains why the order
 *  differs and which two routes branch on it.
 *
 *  Generation is still queued in the background and the job is unaffected by
 *  where the user stands; `generating` is a *view* onto it rather than a gate,
 *  and both of its exits leave the job running. */
export default function TryLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      {/* Both fade: the wait dissolves into the result rather than sliding, so
          the photo the user has been watching stays put under the transition. */}
      {/* The job is already running behind it and both of its buttons lead
          onwards, so there is nothing to swipe back to. */}
      <Stack.Screen name="notify" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="generating" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="result" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
