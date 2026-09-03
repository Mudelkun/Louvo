import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { GeneratedLook } from '@/api/types';

const FAVOURITES_KEY = 'hairify.favourites.v1';
const LOOKS_KEY = 'hairify.looks.v1';

/**
 * Looks stored before generation existed carry no `simulated` flag, and the
 * missing value has to read as `true`: every one of them is the user's own photo
 * with a style recorded against it. Defaulting the other way would hang a "your
 * new look" label on an unedited photo.
 */
function readLooks(raw: string): GeneratedLook[] {
  const stored = JSON.parse(raw) as GeneratedLook[];
  return stored.map((look) => ({ ...look, simulated: look.simulated ?? true }));
}

interface LibraryState {
  favouriteIds: string[];
  savedLooks: GeneratedLook[];
  ready: boolean;
  isFavourite: (hairstyleId: string) => boolean;
  toggleFavourite: (hairstyleId: string) => void;
  saveLook: (look: GeneratedLook) => void;
  removeLook: (lookId: string) => void;
  clearAll: () => void;
}

const LibraryContext = createContext<LibraryState | null>(null);

/**
 * Favourites and saved looks. Persisted on-device for the prototype; the same
 * surface becomes a `/me/favourites` + `/me/looks` sync once accounts exist.
 */
export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [savedLooks, setSavedLooks] = useState<GeneratedLook[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rawFavourites, rawLooks] = await AsyncStorage.multiGet([FAVOURITES_KEY, LOOKS_KEY]);
        if (!active) return;
        if (rawFavourites[1]) setFavouriteIds(JSON.parse(rawFavourites[1]));
        if (rawLooks[1]) setSavedLooks(readLooks(rawLooks[1]));
      } catch {
        // A corrupt cache is not worth blocking the app for.
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((key: string, value: unknown) => {
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
  }, []);

  const toggleFavourite = useCallback(
    (hairstyleId: string) => {
      setFavouriteIds((prev) => {
        const next = prev.includes(hairstyleId)
          ? prev.filter((id) => id !== hairstyleId)
          : [hairstyleId, ...prev];
        persist(FAVOURITES_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const saveLook = useCallback(
    (look: GeneratedLook) => {
      setSavedLooks((prev) => {
        const next = [look, ...prev.filter((entry) => entry.id !== look.id)].slice(0, 60);
        persist(LOOKS_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const removeLook = useCallback(
    (lookId: string) => {
      setSavedLooks((prev) => {
        const next = prev.filter((entry) => entry.id !== lookId);
        persist(LOOKS_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const clearAll = useCallback(() => {
    setFavouriteIds([]);
    setSavedLooks([]);
    persist(FAVOURITES_KEY, []);
    persist(LOOKS_KEY, []);
  }, [persist]);

  const value = useMemo<LibraryState>(
    () => ({
      favouriteIds,
      savedLooks,
      ready,
      isFavourite: (hairstyleId: string) => favouriteIds.includes(hairstyleId),
      toggleFavourite,
      saveLook,
      removeLook,
      clearAll,
    }),
    [favouriteIds, savedLooks, ready, toggleFavourite, saveLook, removeLook, clearAll],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryState {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return context;
}
