export type ColorScheme = {
  background: string;
  settingsBackground: string;
  surface: string;
  surfaceRaised: string;
  surfaceSubtle: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  divider: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  destructive: string;
  success: string;
  overlay: string;
  code: string;
};

export const lightColors: ColorScheme = {
  background: '#FFFFFF',
  settingsBackground: '#F6F6F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSubtle: '#F6F6F7',
  text: '#101012',
  textMuted: '#707076',
  textFaint: '#9B9BA3',
  border: '#ECECEF',
  divider: '#F2F2F4',
  primary: '#09090B',
  primaryText: '#FFFFFF',
  accent: '#09090B',
  accentSoft: '#F4F4F5',
  destructive: '#DC2626',
  success: '#16A34A',
  overlay: 'rgba(0, 0, 0, 0.45)',
  code: '#18181B',
};

export const darkColors: ColorScheme = {
  background: '#101012',
  settingsBackground: '#161619',
  surface: '#19191C',
  surfaceRaised: '#222226',
  surfaceSubtle: '#252529',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  border: '#27272A',
  divider: '#1F1F22',
  primary: '#FAFAFA',
  primaryText: '#09090B',
  accent: '#FAFAFA',
  accentSoft: '#1C1C1F',
  destructive: '#EF4444',
  success: '#22C55E',
  overlay: 'rgba(0, 0, 0, 0.72)',
  code: '#09090B',
};
