import * as React from 'react';
import { Pressable } from 'react-native';
import { ChevronRight, Pencil } from 'lucide-react-native';

import { objectName, type FileDiffGroup } from '@paiapp/ui-thread';

import { useAppTheme } from '@/theme/theme-context';
import { copy, toolCopy } from '@/strings/zh';
import { monospaceFont } from '@/components/monospace-font';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';

type FileDiffRowProps = { group: FileDiffGroup; onOpen: (group: FileDiffGroup) => void };

/**
 * 单个文件的 diff 入口行（与执行行同形态：图标 + 动作 + 文件名 + 箭头）——
 * 这行展示的就是上面那些执行行做的编辑，同一件事不该有两种长相。
 * 图标恒为铅笔（这里只可能是编辑），动作恒为「已编辑」（渲染时机即已落定）。
 * 触屏无 hover：箭头常显，点按进底部 Sheet 看红绿对照（屏幕窄，diff 不做行内展开）。
 */
export function FileDiffRow({ group, onOpen }: FileDiffRowProps) {
  const { colors } = useAppTheme();
  const name = objectName(group.path) || copy.fileDiffUnknown;
  return (
    <Pressable
      accessibilityLabel={copy.fileDiffDetailLabel(name)}
      accessibilityRole="button"
      onPress={() => onOpen(group)}
      style={rowPressStyle}
    >
      <Marker style={styles.marker}>
        <MarkerIcon color={colors.textFaint}>
          <Pencil color={colors.textMuted} size={15} strokeWidth={1.75} />
        </MarkerIcon>
        <MarkerContent numberOfLines={1} style={{ color: colors.textMuted, fontWeight: '600', marginRight: 6 }}>
          {toolCopy.rowDoneEdit}
        </MarkerContent>
        <MarkerContent numberOfLines={1} style={{ color: colors.textMuted, flexShrink: 1, fontFamily: monospaceFont }}>
          {name}
        </MarkerContent>
      </Marker>
      <ChevronRight color={colors.textFaint} size={15} testID="diff-row-chevron" />
    </Pressable>
  );
}

const styles = { marker: { flexShrink: 1 } };
