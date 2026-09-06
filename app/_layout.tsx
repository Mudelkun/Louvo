import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LookNotification } from '@/components/LookNotification';
import { ScreenCaptureGuard } from '@/components/ScreenCaptureGuard';
import { AccountProvider } from '@/state/AccountContext';
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
  // over-scrolled list, and left at the launch value it flashes near-white
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
              {/* Above `<GenerationProvider>` because generation reads it: a job
                  settling refreshes the balance, and the balance is what decides
                  whether the next one may start. */}
              <AccountProvider>
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
                      {/* Both reached from Settings and from a generation that
                          ran out of credits. Modal-ish presentation is deliberately
                          not used: they are destinations somebody navigated to on
                          purpose, and a sheet that can be swiped away mid-purchase
                          is a worse place to be taking money. */}
                      <Stack.Screen name="credits" />
                      <Stack.Screen name="sign-in" />
                      {/* Where a shared link lands. `luvo://s/<code>` and, once
                          the association files are live, `https://<host>/s/<code>`
                          — see `app/s/[code].tsx`. It resolves the code and
                          replaces itself with the cut, so it is a doorway rather
                          than a destination. */}
                      <Stack.Screen name="s" options={{ animation: 'fade' }} />
                    </Stack>
                    {/* Sits above every screen: previews finish in the background. */}
                    <LookNotification />
                    {/* Screenshots off, everywhere, for as long as the app runs
                        — a screenshot of a card or of a finished preview is our
                        render, extracted, and it is worth more to somebody
                        else's image model than to us. Mounted here because the
                        block is a property of the window rather than of a
                        screen, so there is nowhere below this it could sit
                        without leaving the screens above it uncovered.
                        `src/lib/screenCapture.ts` has what each platform
                        actually enforces. */}
                    <ScreenCaptureGuard />
                  </PhotoPickerProvider>
                </GenerationProvider>
              </AccountProvider>
            </SessionProvider>
          </LibraryProvider>
        </CatalogProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
