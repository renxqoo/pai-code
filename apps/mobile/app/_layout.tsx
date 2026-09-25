import * as React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/theme-provider';
import { useSettingsStore } from '@/store/settings-store';

export default function RootLayout() {
  const theme = useSettingsStore((state) => state.theme);
  return (
    <SafeAreaProvider>
      <ThemeProvider preference={theme}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ animation: 'slide_from_right', contentStyle: { backgroundColor: 'transparent' }, headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="search" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="appearance" />
          <Stack.Screen name="preferences" />
          <Stack.Screen name="models" />
          <Stack.Screen name="usage" />
          <Stack.Screen name="archived" />
          <Stack.Screen name="files" />
          <Stack.Screen name="devices" />
          <Stack.Screen name="projects" />
          <Stack.Screen name="help" />
          <Stack.Screen name="about" />
          <Stack.Screen name="privacy" />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
