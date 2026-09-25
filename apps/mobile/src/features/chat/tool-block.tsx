import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, CircleAlert, Terminal } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import type { TimelineBlock } from '@/features/chat/timeline-blocks';
import { formatTimelineDuration } from '@/features/chat/timeline-duration';

type ToolBlockProps = { block: Extract<TimelineBlock, { kind: 'tools' }> };

export function ToolBlock({ block }: ToolBlockProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  const running = block.messages.some((message) => message.status === 'running');
  const failed = block.messages.at(-1)?.status === 'error';
  const total = block.messages.reduce((sum, message) => sum + (message.durationMs ?? 0), 0);
  return (
    <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 6, overflow: 'hidden' }}>
      <Pressable accessibilityLabel="展开或收起执行过程" accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ alignItems: 'center', flexDirection: 'row', minHeight: 46, paddingHorizontal: 12 }}>
        {running ? <ActivityIndicator color={colors.textMuted} size="small" /> : <Terminal color={colors.textMuted} size={17} />}
        <View style={{ flex: 1, marginLeft: 9 }}><Text style={{ color: failed ? colors.destructive : colors.text, fontSize: 13, fontWeight: '600' }}>{running ? '执行过程' : failed ? '执行失败' : '执行完成'}</Text><Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{block.messages.at(-1)?.summary ?? `${block.messages.length} 个步骤`}</Text></View>
        <Text style={{ color: colors.textFaint, fontSize: 10, marginRight: 4 }}>{block.messages.length} 步 · {formatTimelineDuration(total)}</Text>{expanded ? <ChevronDown color={colors.textFaint} size={16} /> : <ChevronRight color={colors.textFaint} size={16} />}
      </Pressable>
      {expanded ? <View style={{ paddingBottom: 8 }}>{block.messages.map((message) => <View key={message.id} style={{ borderTopColor: colors.divider, borderTopWidth: 1, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 }}><View style={{ marginTop: 2 }}>{message.status === 'running' ? <ActivityIndicator color={colors.textMuted} size="small" /> : message.status === 'error' ? <CircleAlert color={colors.destructive} size={16} /> : <Check color={colors.success} size={16} />}</View><View style={{ flex: 1, marginLeft: 9 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{message.title ?? '执行工具'}</Text><Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 }}>{message.text}</Text></View><Text style={{ color: colors.textFaint, fontSize: 10 }}>{message.durationMs ? formatTimelineDuration(message.durationMs) : null}</Text></View>)}</View> : null}
    </View>
  );
}
