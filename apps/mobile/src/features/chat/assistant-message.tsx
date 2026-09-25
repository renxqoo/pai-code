import * as React from 'react';
import { View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { MarkdownText } from '@/features/chat/markdown/markdown-text';
import type { ChatMessage } from '@/types/domain';

type AssistantMessageProps = { message: ChatMessage };

export function AssistantMessage({ message }: AssistantMessageProps) {
  return <View style={{ paddingVertical: spacing.sm }}><MarkdownText source={message.text} /></View>;
}
