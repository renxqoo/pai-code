import * as React from 'react';
import { Pressable } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { toolGroupLabel, toolGroupStatus } from '@paiapp/ui-thread';

import { useAppTheme } from '@/theme/theme-context';
import { copy, toolCopy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ToolView } from '@/features/chat/tool-message';
import { toolGroupIcon } from '@/features/chat/tool-icons';

type ToolGroupHeaderProps = { views: readonly ToolView[]; open: boolean; onToggle: () => void };

/**
 * 并行执行组的标题行（与 PC 端 ToolGroupHeader 同信息架构）：类别图标 +
 * 合成标题（「编辑了文件运行了命令」）+ 点按开合。标题与工具行同为弱化灰：
 * 执行过程是正文之外的注脚。触屏无 hover：箭头常显，整行 ≥44pt 触控区。
 * 类别语义优先于成败——失败的一组仍是「编辑」而不是红叉，失败由标题文字
 * 变色与组内「运行失败」行承担。
 */
export function ToolGroupHeader({ views, open, onToggle }: ToolGroupHeaderProps) {
  const { colors } = useAppTheme();
  const running = toolGroupStatus(views) === 'running';
  const failed = toolGroupStatus(views) === 'failed';
  const label = toolGroupLabel(views, toolCopy) || copy.toolDetailFallback;
  const GroupIcon = toolGroupIcon(views);
  const tone = failed ? colors.destructive : colors.textMuted;
  return (
    <Pressable
      accessibilityLabel={`${open ? copy.collapseToolGroup : copy.expandToolGroup}：${label}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      testID="tool-group-toggle"
      style={rowPressStyle}
    >
      <Marker style={styles.marker}>
        <MarkerIcon loading={running} color={failed ? colors.destructive : colors.textFaint}>
          <GroupIcon color={tone} size={15} strokeWidth={1.75} />
        </MarkerIcon>
        <MarkerContent shimmer={running} numberOfLines={1} style={{ color: tone, fontWeight: '600', marginRight: 6 }}>
          {label}
        </MarkerContent>
      </Marker>
      {open ? (
        <ChevronDown color={colors.textFaint} size={15} testID="group-chevron" />
      ) : (
        <ChevronRight color={colors.textFaint} size={15} testID="group-chevron" />
      )}
    </Pressable>
  );
}

const styles = { marker: { flexShrink: 1 } };
