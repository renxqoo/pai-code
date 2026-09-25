import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';

type AssistantMessageProps = { message: ChatMessage };

export function AssistantMessage({ message }: AssistantMessageProps) {
  const { colors } = useAppTheme();
  return <View style={{ paddingVertical: spacing.sm }}><Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}>{message.text}</Text></View>;
}
