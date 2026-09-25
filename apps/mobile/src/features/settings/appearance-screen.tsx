import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SectionHeader } from '@/components/ui/section-header';
import { useSettingsStore } from '@/store/settings-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import type { ThemePreference } from '@/types/domain';

export function AppearanceScreen() {
  const { colors } = useAppTheme();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="外观" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="主题" /><Card style={{ padding: spacing.xs3 }}><SegmentedControl options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '跟随系统' }]} value={theme} onChange={(value: ThemePreference) => setTheme(value)} /><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.xs3 }}>选择浅色、深色，或让 Pai Code 跟随系统外观。界面会立即应用并保持清晰的对比度。</Text></Card></ScrollView></View>;
}
