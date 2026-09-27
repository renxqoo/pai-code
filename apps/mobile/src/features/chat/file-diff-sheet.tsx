import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';

import { objectName } from '@paiapp/ui-thread';

import { Sheet } from '@/components/ui/sheet';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing, type } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { monospaceFont } from '@/components/monospace-font';
import { useNavigationStore } from '@/store/navigation-store';
import { DiffLines } from '@/features/chat/diff-lines';

/**
 * 文件改动详情（根级底部 Sheet）：同一文件多次编辑合成的 diff 在这里做
 * 红绿行对照。移动端不做行内展开——屏幕窄，代码块需要横向空间，Sheet
 * 是「改了什么」的唯一出口。
 */
export function FileDiffSheet() {
  const { colors } = useAppTheme();
  const group = useNavigationStore((state) => state.fileDiff);
  const close = useNavigationStore((state) => state.closeFileDiff);
  const name = group === null ? '' : objectName(group.path) || copy.fileDiffUnknown;
  return (
    <Sheet onClose={close} title={copy.fileDiffTitle} visible={group !== null}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs5 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs }}>
          <Pencil color={colors.textMuted} size={16} />
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: type.row.fontSize, fontWeight: '700', marginLeft: 7 }}>
            {name}
          </Text>
        </View>
        {group !== null && group.path !== name ? (
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontFamily: monospaceFont, fontSize: type.meta.fontSize, marginBottom: spacing.sm }}>
            {group.path}
          </Text>
        ) : null}
        <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md }}>
          {group !== null ? <DiffLines hunks={group.hunks} /> : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
