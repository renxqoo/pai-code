import * as React from 'react';
import { lightColors, type ColorScheme } from '@/theme/colors';

export type ThemeContextValue = { colors: ColorScheme; isDark: boolean };

export const ThemeContext = React.createContext<ThemeContextValue>({ colors: lightColors, isDark: false });

export function useAppTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
