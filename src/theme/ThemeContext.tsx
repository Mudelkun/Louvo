import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { type Palette, type Shadows, type Theme, type ThemeName, themes } from './tokens';

/**
 * What the user asked for, which is not the same as what is on screen.
 *
 * `system` is the default and is a *deferral* rather than a value: the phone
 * decides, and it keeps deciding — a device on an automatic light/dark schedule
 * flips the app with it at dusk without anybody opening Settings. `light` and
 * `dark` are overrides that outrank the phone until they are taken back.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'luvo.theme.v1';

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

function parse(value: string | null): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

interface ThemeState extends Theme {
  /** What is actually being drawn: the preference, with `system` resolved. */
  name: ThemeName;
  /** What the user chose. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** What the phone is reporting, so Settings can say what `system` means today. */
  systemName: ThemeName;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Holds the scheme the whole app is drawn in.
 *
 * Above every other provider in `app/_layout.tsx`, because a screen cannot be
 * painted before the palette is known — and it never blocks on storage. The
 * preference loads asynchronously and the first frame is drawn from the phone's
 * own scheme, which is the answer for everyone who has not overridden it. Doing
 * it the other way would mean a splash held open by an AsyncStorage read, or a
 * flash of the wrong scheme, to serve the minority who did.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemName: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setStored] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (active) setStored(parse(value));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  const name = preference === 'system' ? systemName : preference;

  const value = useMemo<ThemeState>(
    () => ({ ...themes[name], preference, setPreference, systemName }),
    [name, preference, setPreference, systemName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The live theme.
 *
 * Falls back to the light theme rather than throwing when there is no provider
 * above it. `<ShareCard>` is rendered off-screen for capture and a handful of
 * components are exercised in isolation; a missing provider there should not be
 * a red box over somebody's finished haircut.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext) ?? themes.light;
}

/** The palette on its own — the common case, and it shadows the old import. */
export function useColors(): Palette {
  return useTheme().colors;
}

export function useShadow(): Shadows {
  return useTheme().shadow;
}

/**
 * The scheme preference, for the one screen that sets it.
 *
 * Throws with no provider, unlike `useTheme`: a Settings control that silently
 * wrote to nothing would look like it worked.
 */
export function useThemePreference(): Pick<ThemeState, 'preference' | 'setPreference' | 'name' | 'systemName'> {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('useThemePreference must be used inside a ThemeProvider');
  return state;
}

/**
 * A `StyleSheet.create` that knows about the scheme, and the reason every
 * screen's stylesheet moved inside its component.
 *
 * `StyleSheet.create` runs at module load, so a palette read at the top level
 * of a file is baked into the bundle: the colours a screen was imported with
 * are the colours it keeps, and no amount of re-rendering or remounting changes
 * them. The stylesheet has to be built *per palette* instead, which means the
 * component has to ask for it — hence a hook.
 *
 * Both sheets are built once each and cached for the life of the process, so
 * flipping the scheme is a context change and a map lookup rather than a
 * rebuild of every style in the app. The factory therefore has to be pure: it
 * is called at most twice, and never again when props change.
 *
 * Written at the bottom of a file exactly where `const styles =
 * StyleSheet.create({...})` used to be, and read at the top of the component:
 *
 * ```tsx
 * function Card() {
 *   const styles = useStyles();
 *   const colors = useColors();   // for the inline, per-render cases
 *   ...
 * }
 *
 * const useStyles = makeStyles(({ colors, shadow }) => ({
 *   card: { backgroundColor: colors.surface, ...shadow.card },
 * }));
 * ```
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<never>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new Map<ThemeName, T>();
  return function useStyles(): T {
    const name = useTheme().name;
    let sheet = cache.get(name);
    if (!sheet) {
      sheet = StyleSheet.create(factory(themes[name]));
      cache.set(name, sheet);
    }
    return sheet;
  };
}
