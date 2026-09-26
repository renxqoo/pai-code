import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { type } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';

export function GenerationIndicator() {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel="Pai Code 正在生成回复" style={{ alignItems: 'center', flexDirection: 'row', paddingVertical: spacing.sm }}>
      <ActivityIndicator color={colors.textMuted} size="small" />
      <Text style={{ color: colors.textMuted, fontSize: type.row.fontSize, marginLeft: 9 }}>正在生成回复</Text>
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 6, marginLeft: 8, width: 6 }} />
    </View>
  );
}
