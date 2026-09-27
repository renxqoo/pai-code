import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { toolRowLabelOf, toolSummary } from '@paiapp/ui-thread';

import { useAppTheme } from '@/theme/theme-context';
import { rhythm, type } from '@/theme/tokens';
import { copy, toolCopy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ChatMessage } from '@/types/domain';
import type { TurnView } from '@/features/chat/turns';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { toolViewOf } from '@/features/chat/tool-message';
import { useNavigationStore } from '@/store/navigation-store';
import { StreamItems } from '@/features/chat/stream-items';

type ProcessFoldProps = { turn: TurnView; elapsedMs?: number | undefined };

/** 运行中消息的一行当前动作（工具行 = 状态前缀 + 摘要；思考 = 思考）。 */
function runningHeadline(message: ChatMessage): string {
  if (message.kind === 'tool') {
    const view = toolViewOf(message);
    return `${toolRowLabelOf(view, toolCopy)} ${toolSummary(view.argsPreview)}`.trim() || copy.activityFallback;
  }
  if (message.kind === 'thinking') return copy.thinkingLabel;
  return message.text.trim() || copy.activityFallback;
}

/**
 * 轮级过程折叠：头行 = 工作时长 + 变更摘要 + 运行中当前动作，展开是完整过程流。
 * 头行裁决：完成「共工作 X」/ 执行中「已工作 X」，不显示「已完成」；无时长数据
 * 退化为状态词。轮级失败是终态（轮末 TurnFailureNotice），不是折叠头状态。
 * 自动开合与 PC 端轮级同口径：运行中/失败常开（失败现场不得被收起摘要盖住），
 * 正常完成收起为摘要；手动意图优先于自动。触屏无 hover：箭头常显。
 */
export function ProcessFold({ turn, elapsedMs }: ProcessFoldProps) {
  const { colors } = useAppTheme();
  const runningMessage = turn.stream.findLast((message) => message.status === 'running');
  const [pref, setPref] = React.useState<boolean | null>(null);
  const open = pref ?? (turn.running || turn.failed);
  const openToolDetail = useNavigationStore((state) => state.openToolDetail);
  const openFileDiff = useNavigationStore((state) => state.openFileDiff);
  const elapsed = formatElapsed(elapsedMs ?? Number.NaN);
  const label =
    elapsed !== null
      ? turn.running
        ? copy.workingFor(elapsed)
        : copy.workedFor(elapsed)
      : runningMessage !== undefined
        ? copy.activityRunning
        : copy.processLabel;
  const summary = runningMessage === undefined ? '' : runningHeadline(runningMessage);
  return (
    <View style={{ marginTop: rhythm.turnGap }}>
      <Pressable
        accessibilityLabel={`${open ? copy.collapseProcess : copy.expandProcess}：${label}${summary.length > 0 ? ` · ${summary}` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setPref(!open)}
        testID="process-fold-toggle"
        style={rowPressStyle}
      >
        <View style={styles.headBlock}>
          <View style={styles.headerRow}>
            <Marker style={styles.marker}>
              <MarkerIcon loading={runningMessage !== undefined} color={colors.textMuted} testID="fold-spinner" />
              <MarkerContent shimmer={runningMessage !== undefined} numberOfLines={1} style={styles.label}>{label}</MarkerContent>
            </Marker>
            {open ? <ChevronDown color={colors.textFaint} size={15} /> : <ChevronRight color={colors.textFaint} size={15} />}
          </View>
          {summary.length > 0 ? (
            <Text testID="fold-headline" numberOfLines={1} style={{ color: colors.textFaint, fontSize: type.meta.fontSize, marginTop: 2 }}>
              {summary}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {open ? (
        <View style={{ marginTop: rhythm.headToRow }}>
          <StreamItems messages={turn.stream} onOpenTool={openToolDetail} onOpenDiff={openFileDiff} />
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  headerRow: { alignItems: 'center' as const, flexDirection: 'row' as const },
  headBlock: { flexShrink: 1 },
  label: { fontWeight: '600' as const },
  marker: { flexShrink: 1 },
};
