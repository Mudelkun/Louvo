import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LookNotification } from '@/components/LookNotification';
import { CatalogProvider } from '@/state/CatalogContext';
import { GenerationProvider } from '@/state/GenerationContext';
import { LibraryProvider } from '@/state/LibraryContext';
import { PhotoPickerProvider } from '@/state/PhotoPickerContext';
import { SessionProvider } from '@/state/SessionContext';
import { ThemeProvider, useTheme } from '@/theme/theme';

/**
 * `<ThemeProvider>` is outside everything, including the navigator.
 *
 * Two reasons rather than tidiness. Every provider below it renders screens
 * that read the palette, so it has to be above them; and the three things the
 * *operating system* draws around the app — the status bar glyphs, the window
 * background behind the navigator, and the colour a screen transition slides
 * over — are not React views and each has to be told the scheme separately.
 * `<AppShell>` is where that happens, and it can only read the theme by sitting
 * inside the provider, which is what the split is for.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { name, colors } = useTheme();

  // The window behind the navigator. Re-run on the scheme, not once on mount:
  // this is what shows through during a screen transition and behind an
  // over-scrolled list, and left at the launch value it flashes bone white
  // under a dark app the first time somebody flips the switch.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
  }, [colors.canvas]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CatalogProvider>
          <LibraryProvider>
            <SessionProvider>
              <GenerationProvider>
                <PhotoPickerProvider>
                  {/* The clock and the battery, which have to contrast with the
                      canvas rather than match the phone: an app forced to light
                      on a dark phone needs dark glyphs. */}
                  <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.canvas },
                      animation: 'slide_from_right',
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
                    <Stack.Screen name="try" />
                    <Stack.Screen name="settings" />
                    {/* Where a shared link lands. `hairify://s/<code>` and, once
                        the association files are live, `https://<host>/s/<code>`
                        — see `app/s/[code].tsx`. It resolves the code and
                        replaces itself with the cut, so it is a doorway rather
                        than a destination. */}
                    <Stack.Screen name="s" options={{ animation: 'fade' }} />
                  </Stack>
                  {/* Sits above every screen: previews finish in the background. */}
                  <LookNotification />
                </PhotoPickerProvider>
              </GenerationProvider>
            </SessionProvider>
          </LibraryProvider>
        </CatalogProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
