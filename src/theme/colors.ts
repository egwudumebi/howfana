/**
 * Howfana brand tokens — Terracotta #B85C38.
 */

export type ThemeColors = {
  bg: string;
  surface: string;
  chrome: string;
  text: string;
  title: string;
  muted: string;
  textLight: string;
  accent: string;
  accentSoft: string;
  border: string;
  divider: string;
  iconInactive: string;
  like: string;
  danger: string;
  online: string;
  bubbleMine: string;
  bubbleTheirs: string;
  cover: string;
  coverAlt: string;
  terracotta50: string;
  terracotta100: string;
  terracotta200: string;
  terracotta300: string;
  terracotta400: string;
  terracotta500: string;
  terracotta600: string;
  brandCyan: string;
  brandBlue: string;
  brandPurple: string;
  brandGreen: string;
  brandNavy: string;
};

const terracotta = {
  terracotta50: '#F6D8CC',
  terracotta100: '#E9A88C',
  terracotta200: '#D97D5A',
  terracotta300: '#B85C38',
  terracotta400: '#9A4B2F',
  terracotta500: '#7A3A23',
  terracotta600: '#5A2A18',
  brandCyan: '#E9A88C',
  brandBlue: '#B85C38',
  brandPurple: '#9A4B2F',
  brandGreen: '#2ECC71',
  brandNavy: '#5A2A18',
  accent: '#B85C38',
  like: '#B85C38',
  danger: '#E53935',
  online: '#2ECC71',
  bubbleMine: '#B85C38',
  cover: '#B85C38',
  coverAlt: '#9A4B2F',
} as const;

export const lightColors: ThemeColors = {
  bg: '#FFFFFF',
  surface: '#F3F4F6',
  chrome: '#FFFFFF',
  /** Body / primary UI text — soft grey, not hard black */
  text: '#4B5563',
  /** Slightly darker for titles / names */
  title: '#374151',
  muted: '#848C98',
  textLight: '#9AA3AF',
  accentSoft: '#F6D8CC',
  border: '#E8EAED',
  divider: '#EEF0F3',
  iconInactive: '#C4C9D1',
  bubbleTheirs: '#F3F4F6',
  ...terracotta,
};

export const darkColors: ThemeColors = {
  bg: '#121212',
  surface: '#1E1E1E',
  chrome: '#1A1A1A',
  text: '#D1D5DB',
  title: '#F3F4F6',
  muted: '#8B939F',
  textLight: '#5F6775',
  accentSoft: '#3D241C',
  border: '#2A2A2A',
  divider: '#2A2A2A',
  iconInactive: '#4B5563',
  bubbleTheirs: '#2A2A2A',
  ...terracotta,
};

/** Default export for non-React modules (mark geometry, etc.). Prefer useColors() in UI. */
export const colors = lightColors;

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREF_KEY = 'howfana.theme.preference';
