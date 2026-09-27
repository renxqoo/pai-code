import * as React from 'react';
import { Text, View } from 'react-native';

import { allHunkLines, type HunkLine } from '@paiapp/ui-thread';

import { useAppTheme } from '@/theme/theme-context';
import type { ColorScheme } from '@/theme/colors';
import { radius, spacing, type } from '@/theme/tokens';
import { monospaceFont } from '@/components/monospace-font';
import type { EditHunkView } from '@paiapp/contracts';

type DiffLinesProps = { hunks: readonly EditHunkView[] };

/**
 * 补丁片段的红绿行对照（与 PC 端 EditHunkList 同形态）：逐行铺开而不是整块
 * 着色——一行一行的对照才看得出「改了哪几行」。删除行红底、新增行绿底、
 * 行首 +/- 标记；多段补丁堆叠，段间一条淡分隔线标出「这是另一处改动」。
 */
export function DiffLines({ hunks }: DiffLinesProps) {
  const { colors } = useAppTheme();
  const lines = allHunkLines(hunks);
  if (lines.length === 0) return null;
  return (
    <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, overflow: 'hidden' }}>
      {lines.map((line) => (
        <View
          key={line.key}
          style={{
            backgroundColor: toneBackground(line, colors),
            borderTopColor: colors.divider,
            borderTopWidth: line.startsHunk ? 1 : 0,
            flexDirection: 'row',
            paddingHorizontal: spacing.xs2,
            paddingVertical: 1,
          }}
        >
          <Text style={{ color: toneColor(line, colors), fontFamily: monospaceFont, fontSize: type.meta.fontSize, lineHeight: 17, opacity: 0.7, width: 12 }}>
            {line.tone === 'add' ? '+' : line.tone === 'remove' ? '-' : ' '}
          </Text>
          <Text selectable style={{ color: toneColor(line, colors), flex: 1, fontFamily: monospaceFont, fontSize: type.meta.fontSize, lineHeight: 17 }}>
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function toneColor(line: HunkLine, colors: ColorScheme): string {
  if (line.tone === 'add') return colors.diffAdd;
  if (line.tone === 'remove') return colors.diffDel;
  return colors.textMuted;
}

function toneBackground(line: HunkLine, colors: ColorScheme): string {
  if (line.tone === 'add') return colors.diffAddSoft;
  if (line.tone === 'remove') return colors.diffDelSoft;
  return 'transparent';
}
