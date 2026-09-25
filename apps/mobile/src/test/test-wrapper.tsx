import * as React from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

const initialMetrics: Metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

export function TestWrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>;
}
