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
import { colors } from '@/theme/theme';

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CatalogProvider>
          <LibraryProvider>
            <SessionProvider>
              <GenerationProvider>
                <PhotoPickerProvider>
                  <StatusBar style="dark" />
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
