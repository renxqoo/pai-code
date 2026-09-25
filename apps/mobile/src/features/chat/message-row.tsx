import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';

type MessageRowProps = { message: ChatMessage };

export function MessageRow({ message }: MessageRowProps) {
  const { colors } = useAppTheme();
  if (message.kind === 'user') {
    return (
      <View style={{ alignItems: 'flex-end', paddingVertical: spacing.sm }}>
        <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 5, maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 11 }}>
          <Text selectable style={{ color: colors.primaryText, fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
        </View>
      </View>
    );
  }
  if (message.kind === 'assistant' || message.kind === 'system') {
    return (
      <View style={{ paddingVertical: spacing.sm }}>
        <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}>{message.text}</Text>
      </View>
    );
  }
  if (message.kind === 'thinking') {
    return (
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 6, padding: 13 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 5 }}>思考过程</Text>
        <Text selectable style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{message.text}</Text>
      </View>
    );
  }
  if (message.kind === 'code') {
    return (
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 8, overflow: 'hidden' }}>
        <View style={{ alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 9 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{message.title ?? '代码'}</Text>
          <Text style={{ color: colors.textFaint, fontSize: 11, marginLeft: 'auto' }}>{message.language ?? 'text'}</Text>
        </View>
        <Text selectable style={{ color: colors.text, fontFamily: 'Menlo', fontSize: 12, lineHeight: 19, padding: 13 }}>{message.text}</Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 6, padding: 12 }}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{message.title ?? '执行工具'}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{message.text}</Text>
    </View>
  );
}
