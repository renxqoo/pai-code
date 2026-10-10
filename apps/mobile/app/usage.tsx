import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { UsageCard } from '@/features/usage/usage-card';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function UsageRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="用量" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="按模型" /><View style={{ marginTop: spacing.xs2 }}><UsageCard /></View></ScrollView></View>;
}