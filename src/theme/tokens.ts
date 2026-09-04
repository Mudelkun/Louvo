/**
 * Hairify design tokens.
 *
 * Bone-and-brass on white, and the same identity turned down after dark. The
 * catalog is dark hair on flat white ground, so every neutral here is warm — a
 * violet-tinted grey ramp reads as a tint laid over the renders, and the accent
 * was competing with the content for the eye. Brass is the one saturated
 * colour: far enough from any hair hue that a button is never mistaken for a
 * swatch, warm enough to belong beside the mannequins' plastic and the
 * procedural drawing's skin tones.
 *
 * Nothing here is a React concern. `src/theme/ThemeContext.tsx` is what picks
 * between the two palettes at runtime, and `@/theme/theme` is what screens
 * import.
 *
 * ## Reading the palette
 *
 * Three groups need naming, because "dark" meant two different things as soon
 * as there was a dark scheme and both were spelled `ink` before:
 *
 * - **`ink`, `inkSoft`, `muted`** are *text on the canvas*. They invert: near
 *   black on bone in light, near white on charcoal in dark.
 * - **`inkFill` / `onInkFill`** are the high-emphasis *neutral fill* — a
 *   selected chip, a segmented control's active cell, the `dark` button. They
 *   invert too, and as a pair: white on near-black in light, near-black on bone
 *   in dark. A selected chip that stayed dark on a dark canvas would stop
 *   reading as selected, which is the whole job of that fill.
 * - **`stage` with `onDark` / `onDarkMuted` / `scrim`** are the surfaces that
 *   are dark *on purpose* in both schemes — the welcome hero, the finished-look
 *   toast, a scrim over somebody's photograph. They do not invert; `onDark`
 *   stays white because what sits under it is still dark.
 *
 * `plate` is the ground the mannequin renders sit on, and it does not invert
 * either: every render is shot on flat white, so it *is* that white, and
 * `onPlate` / `onPlateMuted` / `onPlateAccent` are the ink that goes on it.
 *
 * `accent` is deliberately a step deeper than a display brass in light mode
 * (4.7:1 on white) so a solid primary button can carry white body text. Dark
 * mode inverts that relationship rather than repeating it: the brass goes
 * bright and `onAccent` carries the near-black that sits on it. `accentInk` is
 * the brass used as *text* — deep in light, light in dark — because one brass
 * cannot be both a fill and a legible label on that fill.
 */

/**
 * The ground the mannequin renders sit on, and the one colour that is a
 * constant rather than a palette entry.
 *
 * Every render in the catalog is shot on flat white, and this is that white.
 * It does not invert: a dark plate under a render draws a bright rectangle of
 * the render's own white inside a dark card, which is what the hero, the
 * thumbnails and the catalog cards all looked like after dark. Matching the
 * imagery exactly is the only thing that makes that seam disappear — a warm
 * bone plate leaves a visible square in *both* schemes — so a surface that
 * hosts a render stays light in dark mode on purpose, and the card around it,
 * its border and its meta row are what carry the scheme.
 *
 * `<Mannequin>` needs it as a default parameter, outside any hook.
 */
export const plate = '#FFFFFF';

export interface Palette {
  canvas: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  ink: string;
  inkSoft: string;
  inkPressed: string;
  muted: string;
  hairline: string;
  hairlineStrong: string;
  inkFill: string;
  onInkFill: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  accentSoftPressed: string;
  accentInk: string;
  accentGlow: string;
  onAccent: string;
  jade: string;
  jadeSoft: string;
  rust: string;
  rustSoft: string;
  danger: string;
  plate: string;
  stage: string;
  onDark: string;
  onDarkMuted: string;
  scrim: string;
}

export const lightColors: Palette = {
  // Surfaces
  canvas: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F2EEE8',
  surfaceSunken: '#E9E3DA',
  ink: '#181513',
  inkSoft: '#443E38',
  inkPressed: '#2A2521',
  muted: '#8C857C',
  hairline: '#EBE5DD',
  hairlineStrong: '#DCD3C7',

  // The high-emphasis neutral fill, and what rides on it.
  inkFill: '#181513',
  onInkFill: '#FFFFFF',

  // Brand
  accent: '#9A6B24',
  accentPressed: '#7F571C',
  accentSoft: '#F6EEE0',
  accentSoftPressed: '#EEE1CA',
  accentInk: '#6B4715',
  /** The bright end of the brass gradients (progress ring, generating frame). */
  accentGlow: '#E3A24E',
  onAccent: '#FFFFFF',

  // Support
  jade: '#1F8A6B',
  jadeSoft: '#E1F3EC',
  /**
   * The "this is not the real thing" tone — mock data, ungenerated previews, no
   * API key. It was gold, which is now the accent's own family; caution has to
   * read hotter than the brand or every warning looks like a brand highlight.
   */
  rust: '#9E4A22',
  rustSoft: '#F8E7DD',
  danger: '#D2453F',

  // Dark on purpose, in both schemes
  plate,
  stage: '#181513',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(24,21,19,0.55)',
};

/**
 * Text and icons sitting *on* a `plate`, and they do not invert either.
 *
 * A plate is white in both schemes, so anything drawn on one has to come from
 * the light palette — a caption in `colors.muted` is bone-coloured after dark
 * and disappears against the render behind it. Taken from `lightColors` rather
 * than written out again so the two cannot drift.
 */
export const onPlate = lightColors.inkSoft;
export const onPlateMuted = lightColors.muted;
export const onPlateAccent = lightColors.accent;

/**
 * The same identity after dark: warm charcoal rather than neutral grey, so the
 * mannequin plates and the drawing's skin tones still belong beside it.
 *
 * The neutrals keep their light-mode *roles* and swap ends of the ramp, so a
 * screen written as `surface` over `canvas` with a `hairline` between them
 * comes out right without being re-authored. `hairline` is the one that is not
 * an inversion: a border here is a *lighter* charcoal, because a darker line
 * under a dark surface is a line nobody can see.
 */
export const darkColors: Palette = {
  canvas: '#15130F',
  surface: '#1E1B16',
  surfaceAlt: '#26221B',
  surfaceSunken: '#322C22',
  ink: '#F4F0E9',
  inkSoft: '#CFC7BA',
  inkPressed: '#FFFFFF',
  muted: '#9C9285',
  hairline: '#2E2921',
  hairlineStrong: '#403930',

  inkFill: '#EFEAE1',
  onInkFill: '#15130F',

  accent: '#D9A04A',
  accentPressed: '#C08C3B',
  accentSoft: '#332815',
  accentSoftPressed: '#40331B',
  accentInk: '#EBC183',
  accentGlow: '#F2C177',
  onAccent: '#1B1305',

  jade: '#4FC59D',
  jadeSoft: '#12322A',
  rust: '#E08A5A',
  rustSoft: '#3A2116',
  danger: '#F2695F',

  plate,
  stage: '#100E0C',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(10,8,6,0.62)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, lineHeight: 37, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 19, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '700' as const, letterSpacing: 0.2 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '800' as const, letterSpacing: 1.1 },
} as const;

export interface Shadows {
  card: { boxShadow: string };
  raised: { boxShadow: string };
}

/**
 * One shadow property rather than the four `shadow*` ones plus `elevation`.
 *
 * `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset` are deprecated —
 * react-native-web logs it on every load — and `elevation` was always the
 * Android-only half of the same picture. `boxShadow` is the one property that
 * means the same thing on all three platforms, so these are the same two
 * shadows written once: offset, blur, colour at the old opacity.
 */
export const lightShadow: Shadows = {
  card: { boxShadow: '0px 8px 18px rgba(42, 32, 24, 0.07)' },
  raised: { boxShadow: '0px 14px 26px rgba(42, 32, 24, 0.14)' },
};

/**
 * Not the light pair with its opacity raised.
 *
 * A soft brown shadow is invisible on charcoal, so elevation after dark is
 * carried by the surface ramp and the hairlines instead. These are near-black
 * and tighter, doing the one job a shadow still does there: lifting a sheet off
 * whatever it is covering.
 */
export const darkShadow: Shadows = {
  card: { boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.34)' },
  raised: { boxShadow: '0px 12px 24px rgba(0, 0, 0, 0.52)' },
};

export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  colors: Palette;
  shadow: Shadows;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
}

export const themes: Record<ThemeName, Theme> = {
  light: { name: 'light', colors: lightColors, shadow: lightShadow, spacing, radii, type },
  dark: { name: 'dark', colors: darkColors, shadow: darkShadow, spacing, radii, type },
};
