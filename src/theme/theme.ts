/**
 * Hairify design tokens.
 *
 * Bone-and-brass on white. The catalog is dark hair on flat white ground, so
 * every neutral here is warm — a violet-tinted grey ramp reads as a tint laid
 * over the renders, and the accent was competing with the content for the eye.
 * Brass is the one saturated colour: far enough from any hair hue that a
 * button is never mistaken for a swatch, warm enough to belong beside the
 * mannequins' plastic and the procedural drawing's skin tones.
 *
 * `accent` is deliberately a step deeper than a display brass (4.7:1 on white)
 * so a solid primary button can carry white body text without failing contrast.
 */

export const colors = {
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

  // Brand
  accent: '#9A6B24',
  accentPressed: '#7F571C',
  accentSoft: '#F6EEE0',
  accentSoftPressed: '#EEE1CA',
  accentInk: '#6B4715',
  /** The bright end of the brass gradients (progress ring, generating frame). */
  accentGlow: '#E3A24E',

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

  // On-dark
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(24,21,19,0.55)',
} as const;

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

export const shadow = {
  card: {
    shadowColor: '#2A2018',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#2A2018',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
} as const;

export const theme = { colors, spacing, radii, type, shadow };
export type Theme = typeof theme;
