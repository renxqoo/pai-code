import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { PaiMark } from '@/components/brand/pai-mark';
import { copy } from '@/strings/zh';

type EmptyChatProps = { onWorkspace: () => void };

export function EmptyChat({ onWorkspace }: EmptyChatProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xs6 }}>
      <PaiMark size={58} />
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.7, marginTop: spacing.xs4 }}>今天想完成什么？</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, textAlign: 'center' }}>{copy.tagline}</Text>
      <Text accessibilityRole="button" onPress={onWorkspace} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, color: colors.text, fontSize: 13, marginTop: spacing.xs5, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 10 }}>选择工作空间</Text>
    </View>
  );
}
