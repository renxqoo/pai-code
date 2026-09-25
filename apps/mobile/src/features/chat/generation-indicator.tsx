import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

export function GenerationIndicator() {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel="Pai Code 正在生成回复" style={{ alignItems: 'center', flexDirection: 'row', paddingVertical: spacing.sm }}>
      <ActivityIndicator color={colors.textMuted} size="small" />
      <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 9 }}>正在生成回复</Text>
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 6, marginLeft: 8, width: 6 }} />
    </View>
  );
}
