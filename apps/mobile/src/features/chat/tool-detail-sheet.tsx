import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Clock3 } from 'lucide-react-native';

import { detailOutput, toolKindOf, toolPreviewMono, toolRowLabelOf, toolSummary } from '@paiapp/ui-thread';

import { Sheet } from '@/components/ui/sheet';
import { AnsiText } from '@/features/chat/ansi/ansi-text';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing, type } from '@/theme/tokens';
import { copy, toolCopy } from '@/strings/zh';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { monospaceFont } from '@/components/monospace-font';
import { useNavigationStore } from '@/store/navigation-store';
import { toolViewOf } from '@/features/chat/tool-message';
import { toolRowIcon } from '@/features/chat/tool-icons';

/**
 * 工具执行详情（根级底部 Sheet）：完整命令与输出的唯一出口——行内只显
 * 状态前缀 + 单行摘要，命令原文与输出都收在这里（触屏无 hover，看全量
 * 就得点进来看）。运行中的输出只显头部流片段（用户盯的是结果面）。
 */
export function ToolDetailSheet() {
  const { colors } = useAppTheme();
  const message = useNavigationStore((state) => state.toolDetail);
  const close = useNavigationStore((state) => state.closeToolDetail);
  const view = message === null ? null : toolViewOf(message);
  const label = view === null ? '' : toolRowLabelOf(view, toolCopy) || copy.toolDetailFallback;
  const command = view === null ? '' : view.argsPreview;
  const output = view === null ? '' : detailOutput(view);
  const summary = view === null ? '' : toolSummary(command);
  const elapsed = view === null ? null : formatElapsed(view.durationMs ?? Number.NaN);
  // 图标取自 ui-thread 注册表（引用查找非组件创建）：createElement + 小写绑定避开静态组件规则误报
  const rowIcon = view === null ? toolRowIcon('') : toolRowIcon(view.name);
  return (
    <Sheet onClose={close} title={copy.toolDetailTitle} visible={message !== null}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs5 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs }}>
          {React.createElement(rowIcon, { color: colors.textMuted, size: 16 })}
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: type.row.fontSize, fontWeight: '700', marginLeft: 7 }}>
            {label}
          </Text>
        </View>
        {summary.length > 0 && summary !== command ? (
          <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight }}>
            {summary}
          </Text>
        ) : null}
        {elapsed !== null || (view !== null && view.status === 'failed' && view.exitCode !== null) ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: spacing.xs }}>
            {elapsed !== null ? (
              <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                <Clock3 color={colors.textFaint} size={14} />
                <Text style={{ color: colors.textFaint, fontSize: type.meta.fontSize, marginLeft: 6 }}>{copy.workedFor(elapsed)}</Text>
              </View>
            ) : null}
            {view !== null && view.status === 'failed' && view.exitCode !== null ? (
              <Text style={{ color: colors.destructive, fontSize: type.meta.fontSize, marginLeft: 12 }}>{copy.toolFailed(view.exitCode)}</Text>
            ) : null}
          </View>
        ) : null}
        {command.trim().length > 0 ? (
          <>
            <Text accessibilityRole="header" style={{ color: colors.textMuted, fontSize: type.meta.fontSize, fontWeight: '600', marginTop: spacing.sm }}>
              {copy.toolDetailCommand}
            </Text>
            <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginTop: spacing.xs, padding: spacing.xs2 }}>
              <AnsiText text={command} style={{ color: colors.textMuted, fontFamily: monospaceFont, fontSize: type.meta.fontSize, lineHeight: 18 }} />
            </View>
          </>
        ) : null}
        {output.trim().length > 0 ? (
          <>
            <Text accessibilityRole="header" style={{ color: colors.textMuted, fontSize: type.meta.fontSize, fontWeight: '600', marginTop: spacing.sm }}>
              {copy.toolDetailOutput}
            </Text>
            <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginTop: spacing.xs, padding: spacing.xs2 }}>
              <AnsiText
                text={output}
                style={{
                  color: colors.textMuted,
                  fontSize: type.meta.fontSize,
                  lineHeight: 18,
                  ...(toolPreviewMono(toolKindOf(view?.name ?? '')) ? { fontFamily: monospaceFont } : {}),
                }}
              />
            </View>
          </>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight, marginTop: spacing.sm }}>
          {copy.toolDetailNote}
        </Text>
      </ScrollView>
    </Sheet>
  );
}
