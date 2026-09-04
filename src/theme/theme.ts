/**
 * What the app imports. The tokens live in `./tokens`, the runtime scheme in
 * `./ThemeContext`, and this is the one path screens name.
 *
 * There is deliberately **no `colors` export**. There used to be, it was the
 * light palette, and it was read at module scope by every stylesheet in the
 * app — which is exactly what a dark mode cannot survive: `StyleSheet.create`
 * runs at import time, so those colours are frozen into the bundle. Removing
 * the name rather than repointing it is what made the compiler list every site
 * that had to move to `useColors()` / `makeStyles()` instead of leaving a
 * handful of screens silently stuck in light mode.
 *
 * `lightColors` is still exported, for the two things that genuinely are not
 * theme-dependent: `<ShareCard>`, which composes an image other people will
 * see, and anything outside the React tree.
 */

export {
  darkColors,
  darkShadow,
  lightColors,
  lightShadow,
  onPlate,
  onPlateAccent,
  onPlateMuted,
  plate,
  radii,
  spacing,
  themes,
  type,
  type Palette,
  type Shadows,
  type Theme,
  type ThemeName,
} from './tokens';

export {
  ThemeProvider,
  makeStyles,
  useColors,
  useShadow,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from './ThemeContext';
