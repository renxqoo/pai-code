import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';
import { AttachmentChip } from '@/features/composer/attachment-chip';

type UserMessageProps = { message: ChatMessage };

export function UserMessage({ message }: UserMessageProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'flex-end', paddingVertical: spacing.xs2 }}>
      {message.attachments?.length ? <View style={{ alignItems: 'flex-end', marginBottom: spacing.xs, maxWidth: '86%' }}>{message.attachments.map((attachment) => <View key={attachment.id} style={{ marginBottom: 4 }}><AttachmentChip attachment={attachment} /></View>)}</View> : null}
      <View testID="user-task-card" style={{ alignItems: 'flex-end', backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, maxWidth: '86%', minWidth: 72, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 22, textAlign: 'right' }}>{message.text}</Text>
      </View>
    </View>
  );
}
