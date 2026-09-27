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
      {/* 任务卡：与 Agent 正文的层级差靠**载体**而非字号——用户输入是「别人给的
       * 任务」，正文是「系统对你说的话」，两者同号同色时用户读不出谁在说话。
       * 卡面底色 + 次级文字色两重分工（不要左侧色条：它把任务卡读成引用块，
       * 且在窄屏挤占正文宽度）。文字自然换行，不逐行强制居右。 */}
      <View
        testID="user-task-card"
        style={{
          backgroundColor: colors.surfaceSubtle,
          borderRadius: radius.md,
          maxWidth: '86%',
          minWidth: 72,
          paddingRight: 14,
          paddingLeft: 14,
          paddingVertical: 10,
        }}
      >
        <Text selectable style={{ color: colors.textSecondary, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight }}>{message.text}</Text>
      </View>
    </View>
  );
}
