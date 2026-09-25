import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type SectionHeaderProps = { title: string; action?: string; onAction?: () => void };

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 34 }}>
      <Text accessibilityRole="header" style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 }}>{title}</Text>
      {action && onAction ? <Text accessibilityRole="button" onPress={onAction} style={{ color: colors.accent, fontSize: 13, marginLeft: 'auto', padding: spacing.sm }}>{action}</Text> : null}
    </View>
  );
}
