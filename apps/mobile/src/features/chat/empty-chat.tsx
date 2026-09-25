import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { PaiMark } from '@/components/brand/pai-mark';
import { copy } from '@/strings/zh';

type EmptyChatProps = { onWorkspace: () => void };

export function EmptyChat({ onWorkspace }: EmptyChatProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xs6 }}>
      <PaiMark size={56} />
      <Text style={{ color: colors.text, fontSize: 25, fontWeight: '600', letterSpacing: -0.5, marginTop: spacing.xs3 }}>今天想完成什么？</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.xs, textAlign: 'center' }}>{copy.tagline}</Text>
      <Text accessibilityRole="button" onPress={onWorkspace} style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, color: colors.text, fontSize: 13, fontWeight: '600', marginTop: spacing.xs4, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 9 }}>选择工作空间</Text>
    </View>
  );
}
