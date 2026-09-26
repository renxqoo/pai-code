import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm } from '@/theme/tokens';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import type { TurnView } from '@/features/chat/turns';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { useNavigationStore } from '@/store/navigation-store';
import { StreamItems } from '@/features/chat/stream-items';

const firstText = (...values: readonly (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? '';

type ProcessFoldProps = { turn: TurnView; elapsedMs?: number | undefined };

export function ProcessFold({ turn, elapsedMs }: ProcessFoldProps) {
  const { colors } = useAppTheme();
  const runningMessage = turn.stream.findLast((message) => message.status === 'running');
  const [userExpanded, setUserExpanded] = React.useState<boolean | null>(null);
  const expanded = userExpanded ?? false;
  const openToolDetail = useNavigationStore((state) => state.openToolDetail);
  const elapsed = formatElapsed(elapsedMs ?? Number.NaN);
  // 头行裁决：完成「共工作 X」/ 执行中「已工作 X」，不显示「已完成」；无时长数据退化为状态词。
  // 轮级失败是终态（轮末 TurnFailureNotice），不是折叠头状态。
  const label = elapsed !== null
    ? turn.running
      ? copy.workingFor(elapsed)
      : copy.workedFor(elapsed)
    : runningMessage
      ? copy.activityRunning
      : copy.processLabel;
  const summary = runningMessage
    ? firstText(runningMessage.summary, runningMessage.title, copy.activityFallback)
    : '';
  return (
    <View style={{ marginTop: rhythm.turnGap }}>
      <Pressable
        accessibilityLabel={`${expanded ? copy.collapseProcess : copy.expandProcess}：${label}${summary.length > 0 ? ` · ${summary}` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setUserExpanded(!expanded)}
        style={rowPressStyle}
      >
        <View>
          <View style={styles.headerRow}>
            <Marker style={styles.marker}>
              <MarkerIcon loading={runningMessage !== undefined} color={colors.textMuted} testID="fold-spinner" />
              <MarkerContent shimmer={runningMessage !== undefined} numberOfLines={1} style={styles.label}>{label}</MarkerContent>
            </Marker>
            {expanded ? <ChevronDown color={colors.textFaint} size={15} /> : <ChevronRight color={colors.textFaint} size={15} />}
          </View>
          {summary.length > 0 ? <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginTop: 2 }}>{summary}</Text> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: rhythm.headToRow }}>
          <StreamItems messages={turn.stream} onOpenTool={openToolDetail} />
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  headerRow: { alignItems: 'center' as const, flexDirection: 'row' as const },
  label: { fontWeight: '600' as const },
  marker: { flexShrink: 1 },
};
