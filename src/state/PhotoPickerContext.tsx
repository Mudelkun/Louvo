import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { PhotoPickerSheet, type PickerMode } from '@/components/PhotoPickerSheet';

interface PhotoPickerValue {
  open: (mode: PickerMode, onPicked: (uri: string) => void) => void;
}

const PhotoPickerCtx = createContext<PhotoPickerValue | null>(null);

/**
 * Hosts the photo sheet at the root of the app.
 *
 * It lives here rather than inside the screen that asks for a photo because a
 * React Native `Modal` renders in its own window, where iOS has nothing behind
 * the sheet to sample and the Liquid Glass controls come out blank. As a plain
 * overlay in the app's own view tree the effect has real content to refract,
 * and the sheet still covers the tabs.
 */
export function PhotoPickerProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PickerMode | null>(null);
  const handler = useRef<((uri: string) => void) | null>(null);

  const open = useCallback((next: PickerMode, onPicked: (uri: string) => void) => {
    handler.current = onPicked;
    setMode(next);
  }, []);

  const value = useMemo<PhotoPickerValue>(() => ({ open }), [open]);

  return (
    <PhotoPickerCtx.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <PhotoPickerSheet
          mode={mode}
          onChangeMode={setMode}
          onClose={() => setMode(null)}
          onPicked={(uri) => {
            setMode(null);
            handler.current?.(uri);
          }}
        />
      </View>
    </PhotoPickerCtx.Provider>
  );
}

export function usePhotoPickerSheet() {
  return useContext(PhotoPickerCtx);
}
