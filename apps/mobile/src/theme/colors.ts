export type ColorScheme = {
  background: string;
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
  background: '#FAFAF9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSubtle: '#F2F2F0',
  text: '#20201F',
  textMuted: '#6D6B68',
  textFaint: '#9A9792',
  border: '#E7E5E1',
  divider: '#EFEDE9',
  primary: '#242321',
  primaryText: '#FFFFFF',
  accent: '#D86A2C',
  accentSoft: '#FFF1E8',
  destructive: '#C94B45',
  success: '#2F8F6B',
  overlay: 'rgba(22, 21, 20, 0.42)',
  code: '#F5F4F1',
};

export const darkColors: ColorScheme = {
  background: '#171716',
  surface: '#20201F',
  surfaceRaised: '#292927',
  surfaceSubtle: '#262523',
  text: '#F2F1EE',
  textMuted: '#B2AFAA',
  textFaint: '#817E79',
  border: '#383633',
  divider: '#302F2D',
  primary: '#F1F0ED',
  primaryText: '#1D1C1B',
  accent: '#F18749',
  accentSoft: '#3B2A1F',
  destructive: '#ED7770',
  success: '#6DC29B',
  overlay: 'rgba(0, 0, 0, 0.64)',
  code: '#1A1A19',
};
