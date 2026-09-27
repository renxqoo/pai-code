import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react-native';

import { useAppTheme } from '@/theme/theme-context';
import { rhythm, type } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ChatMessage } from '@/types/domain';

type ThinkingRowProps = { message: ChatMessage };

/**
 * 思考单元（与 PC 端 ThinkingBlock 同信息架构）：收起显一行正文预览，
 * 展示开关只听用户手动（默认收起，展开与否完全由用户决定）。
 * 触屏无 hover：箭头常显，点按展开，整行 ≥44pt 触控区；展开区限高滚动。
 */
export function ThinkingRow({ message }: ThinkingRowProps) {
  const { colors } = useAppTheme();
  const running = message.status === 'running';
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View style={{ marginTop: rhythm.rowToRow }}>
      <Pressable
        accessibilityLabel={`${expanded ? copy.collapseThinking : copy.expandThinking}：${copy.thinkingLabel}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={rowPressStyle}
      >
        <Marker style={styles.marker}>
          <MarkerIcon loading={running} color={colors.textMuted} testID={running ? 'thinking-spinner' : undefined}>
            <Brain color={colors.textMuted} size={15} strokeWidth={1.75} />
          </MarkerIcon>
          <MarkerContent shimmer={running} style={{ fontWeight: '600', marginRight: 6 }}>{copy.thinkingLabel}</MarkerContent>
          {expanded ? null : (
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: type.row.fontSize, flexShrink: 1 }}>
              {message.text}
            </Text>
          )}
        </Marker>
        {expanded ? (
          <ChevronDown color={colors.textFaint} size={15} testID="thinking-chevron" />
        ) : (
          <ChevronRight color={colors.textFaint} size={15} testID="thinking-chevron" />
        )}
      </Pressable>
      {expanded ? (
        <ScrollView style={{ maxHeight: 200 }}>
          <Text selectable style={{ color: colors.textMuted, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight }}>
            {message.text}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = { marker: { flexShrink: 1 } };
