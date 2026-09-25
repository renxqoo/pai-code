import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

const usage = [
  { label: 'GPT-5.2 Codex', percent: 62, value: '79.6K' },
  { label: 'Claude Sonnet 5', percent: 24, value: '30.8K' },
  { label: 'Gemini 3 Pro', percent: 14, value: '18.0K' },
] as const;

export function UsageCard() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xs4, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 3 }}>{usage.map((item, index) => <View key={item.label} style={{ borderTopColor: colors.divider, borderTopWidth: index === 0 ? 0 : 1, paddingVertical: 13 }}><View style={{ alignItems: 'center', flexDirection: 'row' }}><Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{item.label}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.value} · {item.percent}%</Text></View><View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 8, marginTop: 10, overflow: 'hidden' }}><View style={{ backgroundColor: colors.text, borderRadius: radius.pill, height: 8, width: `${item.percent}%` }} /></View></View>)}</View>;
}
