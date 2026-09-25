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
    <View style={{ alignItems: 'flex-end', paddingVertical: spacing.sm }}>
      {message.attachments?.length ? <View style={{ alignItems: 'flex-end', marginBottom: spacing.xs, maxWidth: '86%' }}>{message.attachments.map((attachment) => <View key={attachment.id} style={{ marginBottom: 4 }}><AttachmentChip attachment={attachment} /></View>)}</View> : null}
      <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, borderBottomRightRadius: 5, maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 11 }}>
        <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{message.text}</Text>
      </View>
    </View>
  );
}
