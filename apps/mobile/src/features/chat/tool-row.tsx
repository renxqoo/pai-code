import * as React from 'react';
import { Pressable } from 'react-native';
import { Check, ChevronRight, CircleAlert } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ChatMessage } from '@/types/domain';

export function toolStatusIcon(message: ChatMessage, color: string): React.ReactNode {
  return (
    <MarkerIcon loading={message.status === 'running'} color={color} testID={message.status === 'running' ? 'tool-spinner' : undefined}>
      {message.status === 'error' ? <CircleAlert color={color} size={16} /> : <Check color={color} size={16} />}
    </MarkerIcon>
  );
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
      <Marker style={styles.marker}>
        {toolStatusIcon(message, failed ? colors.destructive : colors.textFaint)}
        <MarkerContent
          shimmer={message.status === 'running'}
          numberOfLines={1}
          style={{ color: failed ? colors.destructive : colors.textMuted, marginRight: 6 }}
        >
          {toolRowLabel(message)}
        </MarkerContent>
      </Marker>
      <ChevronRight color={colors.textFaint} size={15} />
    </Pressable>
  );
}

const styles = { marker: { flexShrink: 1 } };
