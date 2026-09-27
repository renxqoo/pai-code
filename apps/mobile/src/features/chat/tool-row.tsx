import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { callExpandable, toolKindOf, toolPreviewMono, toolRowLabelOf, toolSummary } from '@paiapp/ui-thread';

import { useAppTheme } from '@/theme/theme-context';
import { type } from '@/theme/tokens';
import { copy, toolCopy } from '@/strings/zh';
import { monospaceFont } from '@/components/monospace-font';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ChatMessage } from '@/types/domain';
import { toolViewOf } from '@/features/chat/tool-message';
import { toolRowIcon } from '@/features/chat/tool-icons';

type ToolRowProps = { message: ChatMessage; onOpen: (message: ChatMessage) => void };

/**
 * 单个执行单元行（与 PC 端 ToolCallRow 同信息架构）：类别图标 + 状态前缀
 * （已阅读 / 正在运行 / 运行失败）+ 命令摘要 + 失败退出码尾，点按开详情 Sheet。
 * 触屏无 hover：展开箭头常显，行整体是 ≥44pt 的触控区。
 * 行内绝不展示输出原文（完整命令与输出都在详情 Sheet）；一行放不下由
 * numberOfLines 按真实渲染宽度裁剪，文案层不截断。
 */
export function ToolRow({ message, onOpen }: ToolRowProps) {
  const { colors } = useAppTheme();
  const view = toolViewOf(message);
  const running = view.status === 'running';
  const failed = view.status === 'failed';
  const label = toolRowLabelOf(view, toolCopy) || copy.toolDetailFallback;
  const summary = toolSummary(view.argsPreview);
  const expandable = summary.length > 0 || callExpandable(view);
  const RowIcon = toolRowIcon(view.name);
  const mono = toolPreviewMono(toolKindOf(view.name));
  const tone = failed ? colors.destructive : colors.textMuted;
  const spawns = view.subagents;
  return (
    <Pressable
      accessibilityLabel={copy.toolRowDetailLabel(`${label} ${summary}`.trim())}
      accessibilityRole="button"
      onPress={() => onOpen(message)}
      style={rowPressStyle}
    >
      <View style={styles.block}>
        <Marker style={styles.marker}>
          <MarkerIcon
            loading={running}
            color={failed ? colors.destructive : colors.textFaint}
            testID={running ? 'tool-spinner' : undefined}
          >
            <RowIcon color={tone} size={15} strokeWidth={1.75} />
          </MarkerIcon>
          <MarkerContent shimmer={running} numberOfLines={1} style={{ color: tone, fontWeight: '600', marginRight: 6 }}>
            {label}
          </MarkerContent>
          {summary.length > 0 ? (
            <MarkerContent
              shimmer={running}
              numberOfLines={1}
              style={{ color: tone, flexShrink: 1, ...(mono ? { fontFamily: monospaceFont } : {}) }}
            >
              {summary}
            </MarkerContent>
          ) : null}
        </Marker>
        {/* task 工具按参数展开子代理执行清单：每个 spawn 一行（agent 名 + · 任务描述） */}
        {spawns.map((spawn, index) => (
          <View key={`${spawn.agent}-${index}`} style={styles.spawnRow}>
            {spawn.agent.length > 0 ? (
              <Text numberOfLines={1} style={{ color: colors.accent, fontFamily: monospaceFont, fontSize: type.meta.fontSize }}>
                {spawn.agent}
              </Text>
            ) : null}
            {spawn.agent.length > 0 && spawn.task.length > 0 ? (
              <Text style={{ color: colors.textFaint, fontSize: type.meta.fontSize, marginHorizontal: 4 }}>·</Text>
            ) : null}
            {spawn.task.length > 0 ? (
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: type.meta.fontSize, flexShrink: 1 }}>
                {spawn.task}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {failed && view.exitCode !== null ? (
        <Text style={{ color: colors.destructive, fontSize: type.meta.fontSize, marginLeft: 6 }}>
          {copy.toolFailed(view.exitCode)}
        </Text>
      ) : null}
      {expandable ? <ChevronRight color={colors.textFaint} size={15} testID="tool-row-chevron" /> : null}
    </Pressable>
  );
}

const styles = {
  marker: { flexShrink: 1 },
  block: { flexShrink: 1, gap: 2 },
  spawnRow: { alignItems: 'center' as const, flexDirection: 'row' as const, marginLeft: 23 },
};
