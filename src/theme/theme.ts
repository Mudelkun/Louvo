/**
 * Hairify design tokens.
 *
 * Violet-on-white palette matching `App-reference.png`: a near-white canvas,
 * white cards, and a single vivid violet accent used for the primary action and
 * for anything currently selected.
 */

export const colors = {
  // Surfaces
  canvas: '#F8F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1EEFB',
  surfaceSunken: '#E9E5F7',
  ink: '#191627',
  inkSoft: '#403C52',
  muted: '#8B87A0',
  hairline: '#EAE7F5',
  hairlineStrong: '#D6D0EE',

  // Brand
  accent: '#6D3AF2',
  accentPressed: '#5A2ADB',
  accentSoft: '#EFE9FE',
  accentInk: '#3F1E96',

  // Support
  jade: '#1F8A6B',
  jadeSoft: '#E1F3EC',
  gold: '#C8963E',
  goldSoft: '#F7EEDC',
  danger: '#D2453F',

  // On-dark
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.68)',
  scrim: 'rgba(25,22,39,0.55)',
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
    shadowColor: '#1E1738',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#1E1738',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
} as const;

export const theme = { colors, spacing, radii, type, shadow };
export type Theme = typeof theme;
