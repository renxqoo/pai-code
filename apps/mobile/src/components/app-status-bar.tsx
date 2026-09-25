import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '@/theme/theme-context';

export function AppStatusBar() {
  const { isDark } = useAppTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
