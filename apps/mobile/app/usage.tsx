import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { UsageCard } from '@/features/usage/usage-card';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function UsageRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="用量" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ padding: spacing.xs4 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>本周上下文</Text><View style={{ alignItems: 'baseline', flexDirection: 'row', marginTop: 4 }}><Text style={{ color: colors.text, fontSize: 32, fontWeight: '700' }}>128.4K</Text><Text style={{ color: colors.success, fontSize: 12, marginLeft: 'auto' }}>较上周 -8%</Text></View><Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 6 }}>9 月 19 日 – 9 月 25 日</Text></Card><SectionHeader title="按模型" /><View style={{ marginTop: spacing.xs2 }}><UsageCard /></View></ScrollView></View>;
}
