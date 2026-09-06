/**
 * Luvo design tokens.
 *
 * Violet-and-pink on near-white, and the same identity turned down after dark.
 * The palette is taken from the launcher artwork rather than chosen beside it:
 * every hue here is measured out of `assets/Luvo-icon.png`, whose figure is a
 * gradient from a periwinkle violet into a hot pink on a near-black tile.
 *
 * The three anchors, sampled from the core of the artwork's strokes rather than
 * from their anti-aliased edges, and rounded:
 *
 * | Anchor | Measured | Where it lands |
 * | --- | --- | --- |
 * | violet | `#A98CFB` — H256 S93% L77% | `accent` in dark; the light ramp is the same hue taken deeper |
 * | pink | `#FC73AC` — H335 S96% L72% | `accentGlow`, the bright end of every accent gradient |
 * | tile | `#090710` — H253 | `stage`, and the hue the whole neutral ramp is tinted with |
 *
 * **Violet is the accent and pink is only ever the far end of a gradient.**
 * The logo is a gradient and a palette cannot be: a two-colour brand still
 * needs one of them to be the colour a button *is*. Pink at the darkness a
 * solid button needs — white body text, 4.5:1 — turns maroon and stops being
 * the logo's pink at all, where violet goes that deep without leaving its hue.
 * So `accent` is violet at every step, and the pink is spent where a gradient
 * already existed: the progress ring and the generating screen's frame, which
 * now draw the artwork itself rather than a colour sampled from it.
 *
 * The neutrals carry the tile's hue at very low saturation rather than being
 * flat grey, so the canvas belongs to the accent instead of merely tolerating
 * it. **They are kept near-neutral on purpose.** The catalog is dark hair on
 * flat white, and a neutral ramp with real chroma in it reads as a tint laid
 * over the renders — that was the argument for the warm bone ramp this
 * replaces, and it still holds. What changed is which hue the faint cast is,
 * not how faint it is allowed to be. `plate` is untouched and still the
 * render's own white, so nothing directly behind a render moved at all.
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
 *   black on near-white in light, near white on aubergine in dark.
 * - **`inkFill` / `onInkFill`** are the high-emphasis *neutral fill* — a
 *   selected chip, a segmented control's active cell, the `dark` button. They
 *   invert too, and as a pair: white on near-black in light, near-black on
 *   near-white in dark. A selected chip that stayed dark on a dark canvas would
 *   stop reading as selected, which is the whole job of that fill.
 * - **`stage` with `onDark` / `onDarkMuted` / `scrim`** are the surfaces that
 *   are dark *on purpose* in both schemes — the welcome hero, the finished-look
 *   toast, a scrim over somebody's photograph. They do not invert; `onDark`
 *   stays white because what sits under it is still dark. `stage` is the
 *   artwork's own tile, so a hero and the launcher icon are the same black.
 *
 * `plate` is the ground the mannequin renders sit on, and it does not invert
 * either: every render is shot on flat white, so it *is* that white, and
 * `onPlate` / `onPlateMuted` / `onPlateAccent` are the ink that goes on it.
 *
 * `accent` is deliberately a step deeper than the logo's own violet in light
 * mode (6.1:1 on white) so a solid primary button can carry white body text.
 * Dark mode does not need the step and takes the measured violet exactly as it
 * is, inverting the relationship rather than repeating it: `onAccent` carries
 * the near-black that sits on the bright fill. `accentInk` is the violet used
 * as *text* — deep in light, light in dark — because one violet cannot be both
 * a fill and a legible label on that fill.
 */

/**
 * The ground the mannequin renders sit on, and the one colour that is a
 * constant rather than a palette entry.
 *
 * Every render in the catalog is shot on flat white, and this is that white.
 * It does not invert: a dark plate under a render draws a bright rectangle of
 * the render's own white inside a dark card, which is what the hero, the
 * thumbnails and the catalog cards all looked like after dark. Matching the
 * imagery exactly is the only thing that makes that seam disappear — a tinted
 * plate leaves a visible square in *both* schemes — so a surface that hosts a
 * render stays light in dark mode on purpose, and the card around it, its
 * border and its meta row are what carry the scheme.
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
  // Surfaces. The whole ramp is H≈257 — the artwork's own hue — held under 3%
  // saturation, which is a cast rather than a colour: enough that the canvas
  // belongs to the violet, not enough to tint a render sitting on a plate.
  canvas: '#F9F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1EEF9',
  surfaceSunken: '#E5E0F2',
  ink: '#16121F',
  inkSoft: '#453D57',
  inkPressed: '#251F33',
  muted: '#837C93',
  hairline: '#EAE6F4',
  hairlineStrong: '#D8D1E8',

  // The high-emphasis neutral fill, and what rides on it.
  inkFill: '#16121F',
  onInkFill: '#FFFFFF',

  // Brand. The logo's violet (#A98CFB) taken down its own hue until white body
  // text clears AA on it — 6.1:1, where the brass this replaces managed 4.7.
  accent: '#6B3FE4',
  accentPressed: '#5A31C6',
  accentSoft: '#F1EBFE',
  accentSoftPressed: '#E3D8FC',
  accentInk: '#4B23A8',
  /**
   * The logo's pink, measured, and the bright end of the accent gradients — the
   * progress ring and the generating frame. It is the one place in the app
   * where the two halves of the artwork are drawn as the single gradient they
   * are in the icon, which is why the pink is not softened towards the violet.
   */
  accentGlow: '#FC73AC',
  onAccent: '#FFFFFF',

  // Support
  jade: '#1F8A6B',
  jadeSoft: '#E1F3EC',
  /**
   * The "this is not the real thing" tone — mock data, ungenerated previews, no
   * API key. Caution has to read hotter than the brand, and against a violet
   * accent this orange now does that on hue alone. It was picked when the brand
   * was gold and the two were a step apart on one ramp; that pressure is off,
   * which is why it did not move with the rest of the palette.
   */
  rust: '#9E4A22',
  rustSoft: '#F8E7DD',
  danger: '#D2453F',

  // Dark on purpose, in both schemes
  plate,
  stage: '#14101E',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(20,16,30,0.55)',
};

/**
 * Text and icons sitting *on* a `plate`, and they do not invert either.
 *
 * A plate is white in both schemes, so anything drawn on one has to come from
 * the light palette — a caption in `colors.muted` is near-white after dark and
 * disappears against the render behind it. Taken from `lightColors` rather than
 * written out again so the two cannot drift.
 */
export const onPlate = lightColors.inkSoft;
export const onPlateMuted = lightColors.muted;
export const onPlateAccent = lightColors.accent;

/**
 * The same identity after dark: aubergine rather than neutral charcoal, so the
 * canvas is the tile the launcher icon is drawn on rather than a grey the brand
 * happens to sit in front of.
 *
 * The neutrals keep their light-mode *roles* and swap ends of the ramp, so a
 * screen written as `surface` over `canvas` with a `hairline` between them
 * comes out right without being re-authored. `hairline` is the one that is not
 * an inversion: a border here is a *lighter* aubergine, because a darker line
 * under a dark surface is a line nobody can see.
 *
 * `accent` is the artwork's violet at full strength. Light mode had to step
 * away from it to carry white text; here the fill is the bright thing and
 * `onAccent` is the near-black on it, so the brightest violet in the app is the
 * one measured off the icon.
 */
export const darkColors: Palette = {
  canvas: '#100C18',
  surface: '#1A1526',
  surfaceAlt: '#231C33',
  surfaceSunken: '#2E2542',
  ink: '#F2EFF8',
  inkSoft: '#C8C1D6',
  inkPressed: '#FFFFFF',
  muted: '#948CA6',
  hairline: '#2A2338',
  hairlineStrong: '#3B3350',

  inkFill: '#EDE9F5',
  onInkFill: '#100C18',

  accent: '#A98CFB',
  accentPressed: '#9375EE',
  accentSoft: '#2A1D4A',
  accentSoftPressed: '#37275C',
  accentInk: '#C9B3FF',
  accentGlow: '#FF8FC2',
  onAccent: '#17102B',

  jade: '#4FC59D',
  jadeSoft: '#12322A',
  rust: '#E08A5A',
  rustSoft: '#3A2116',
  danger: '#F2695F',

  plate,
  stage: '#0A0712',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(8,6,14,0.62)',
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
 *
 * The colour is the ink's own hue rather than the brown it used to be, for the
 * same reason the neutral ramp is: a warm shadow under a cool card reads as a
 * second light source in the room.
 */
export const lightShadow: Shadows = {
  card: { boxShadow: '0px 8px 18px rgba(28, 20, 48, 0.07)' },
  raised: { boxShadow: '0px 14px 26px rgba(28, 20, 48, 0.14)' },
};

/**
 * Not the light pair with its opacity raised.
 *
 * A soft shadow is invisible on aubergine, so elevation after dark is carried
 * by the surface ramp and the hairlines instead. These are near-black and
 * tighter, doing the one job a shadow still does there: lifting a sheet off
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
