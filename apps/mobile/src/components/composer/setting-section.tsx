import * as React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type SettingSectionProps = { icon: LucideIcon; title: string };

export function SettingSection({ icon: Icon, title }: SettingSectionProps) {
  const { colors } = useAppTheme();
  return <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs2 }}><Icon color={colors.textMuted} size={16} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>{title}</Text></View>;
}
