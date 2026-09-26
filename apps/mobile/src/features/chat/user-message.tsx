import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, rhythm, spacing, type } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';
import { AttachmentChip } from '@/features/composer/attachment-chip';

type UserMessageProps = { message: ChatMessage };

export function UserMessage({ message }: UserMessageProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'flex-end', marginTop: rhythm.turnGap }}>
      {message.attachments?.length ? <View style={{ alignItems: 'flex-end', marginBottom: spacing.xs, maxWidth: '86%' }}>{message.attachments.map((attachment) => <View key={attachment.id} style={{ marginBottom: 4 }}><AttachmentChip attachment={attachment} /></View>)}</View> : null}
      {/* 自适应气泡：内容宽收缩（上限 86%）贴右；文字自然换行，不逐行强制居右 */}
      <View testID="user-task-card" style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, maxWidth: '86%', minWidth: 72, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text selectable style={{ color: colors.text, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight }}>{message.text}</Text>
      </View>
    </View>
  );
}
