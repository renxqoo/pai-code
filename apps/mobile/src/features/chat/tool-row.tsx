import * as React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { Check, ChevronRight, CircleAlert } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import type { ChatMessage } from '@/types/domain';

export function toolStatusIcon(message: ChatMessage, color: string): React.ReactNode {
  if (message.status === 'running') return <ActivityIndicator color={color} size="small" testID="tool-spinner" />;
  if (message.status === 'error') return <CircleAlert color={color} size={16} />;
  return <Check color={color} size={16} />;
}

type ToolRowProps = { message: ChatMessage; onOpen: (message: ChatMessage) => void };

// 工具行文案：动作 + 人类可读摘要，绝不透出命令原文/绝对路径（完整内容在详情弹窗）。
export function toolRowLabel(message: ChatMessage): string {
  const action = message.title?.trim() ?? '';
  const detail = message.summary?.trim() ?? '';
  if (action.length > 0 && detail.length > 0) return `${action}  ${detail}`;
  if (action.length > 0) return action;
  return detail.length > 0 ? detail : copy.activityFallback;
}

export function ToolRow({ message, onOpen }: ToolRowProps) {
  const { colors } = useAppTheme();
  const failed = message.status === 'error';
  return (
    <Pressable
      accessibilityLabel={`查看工具详情：${toolRowLabel(message)}`}
      accessibilityRole="button"
      onPress={() => onOpen(message)}
      style={rowPressStyle}
    >
      {toolStatusIcon(message, failed ? colors.destructive : colors.textFaint)}
      <Text numberOfLines={1} style={{ color: failed ? colors.destructive : colors.textMuted, flex: 1, fontSize: 13, marginLeft: 8 }}>
        {toolRowLabel(message)}
      </Text>
      <ChevronRight color={colors.textFaint} size={15} />
    </Pressable>
  );
}
