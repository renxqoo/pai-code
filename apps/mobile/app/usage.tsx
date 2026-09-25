import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

const usage = [
  { label: 'GPT-5.2 Codex · 62%', percent: '62%' },
  { label: 'Claude Sonnet 5 · 24%', percent: '24%' },
  { label: 'Gemini 3 Pro · 14%', percent: '14%' },
] as const;

export default function UsageRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="用量" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ padding: spacing.xs4 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>本周上下文</Text><Text style={{ color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 4 }}>128.4K</Text><Text style={{ color: colors.success, fontSize: 12, marginTop: 6 }}>较上周减少 8%</Text></Card><SectionHeader title="按模型" /><Card style={{ marginTop: spacing.xs2, padding: spacing.xs3 }}>{usage.map((item) => <View key={item.label} style={{ borderTopColor: colors.divider, borderTopWidth: 1, paddingVertical: 13 }}><Text style={{ color: colors.text, fontSize: 14 }}>{item.label}</Text><View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 4, height: 7, marginTop: 9 }}><View style={{ backgroundColor: colors.accent, borderRadius: 4, height: 7, width: item.percent as `${number}%` }} /></View></View>)}</Card></ScrollView></View>;
}
