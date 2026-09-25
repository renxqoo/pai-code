import * as React from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePreference } from '@/types/domain';
import { darkColors, lightColors } from '@/theme/colors';
import { ThemeContext } from '@/theme/theme-context';

type ThemeProviderProps = { preference: ThemePreference; children: React.ReactNode };

export function ThemeProvider({ preference, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const isDark = preference === 'system' ? system === 'dark' : preference === 'dark';
  const value = React.useMemo(() => ({ colors: isDark ? darkColors : lightColors, isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
