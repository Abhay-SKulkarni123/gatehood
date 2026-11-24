export const colors = {
  background: '#0B1F3A',
  surface: '#132E52',
  surfaceMuted: '#1B3B63',
  text: '#F7FAFC',
  textMuted: '#B9C7D6',
  accent: '#3DDC97',
  danger: '#FF7A7A',
  border: '#2A4B73',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
} as const;

export const typography = {
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
} as const;
