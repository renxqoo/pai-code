import * as React from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { useAppTheme } from '@/theme/theme-context';
import { rhythm } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import type { TurnView } from '@/features/chat/turns';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { useNavigationStore } from '@/store/navigation-store';
import { StreamItems } from '@/features/chat/stream-items';

type ProcessFoldProps = { turn: TurnView; elapsedMs?: number | undefined };

/**
 * 轮级过程折叠：头行 = 工作时长走表，展开是完整过程流。
 * 头行裁决：完成「共工作 X」/ 执行中「已工作 X」，不显示「已完成」；无时长数据
 * 退化为状态词。运行态由文案流光承载——旋转 loading 只在底部输入区（用户裁决：
 * 不放头部），当前动作由过程流的运行行承担，不在头行重复成第二种布局。
 * 轮级失败是终态（轮末 TurnFailureNotice），不是折叠头状态。
 * 自动开合与 PC 端轮级同口径：运行中/失败常开（失败现场不得被收起摘要盖住），
 * 正常完成收起为摘要；手动意图优先于自动。触屏无 hover：箭头常显。
 */
export function ProcessFold({ turn, elapsedMs }: ProcessFoldProps) {
  const { colors } = useAppTheme();
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
      : turn.running
        ? copy.activityRunning
        : copy.processLabel;
  return (
    <View style={{ marginTop: rhythm.turnGap }}>
      <Pressable
        accessibilityLabel={`${open ? copy.collapseProcess : copy.expandProcess}：${label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setPref(!open)}
        testID="process-fold-toggle"
        style={rowPressStyle}
      >
        <Marker style={styles.marker}>
          <MarkerContent shimmer={turn.running} numberOfLines={1} style={styles.label}>
            {label}
          </MarkerContent>
        </Marker>
        {open ? <ChevronDown color={colors.textFaint} size={15} /> : <ChevronRight color={colors.textFaint} size={15} />}
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
  label: { fontWeight: '600' as const },
  marker: { flexShrink: 1 },
};
