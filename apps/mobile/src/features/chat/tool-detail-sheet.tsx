import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Clock3, Wrench } from 'lucide-react-native';
import { Sheet } from '@/components/ui/sheet';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { monospaceFont } from '@/components/monospace-font';
import { useNavigationStore } from '@/store/navigation-store';

// 工具执行详情：与任务配置同构的根级底部 Sheet；完整命令/输出的唯一出口。
export function ToolDetailSheet() {
  const { colors } = useAppTheme();
  const message = useNavigationStore((state) => state.toolDetail);
  const close = useNavigationStore((state) => state.closeToolDetail);
  const elapsed = message === null ? null : formatElapsed(message.durationMs ?? Number.NaN);
  return (
    <Sheet onClose={close} title={copy.toolDetailTitle} visible={message !== null}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs5 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.xs }}>
          <Wrench color={colors.textMuted} size={16} />
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>{message?.title ?? copy.toolDetailFallback}</Text>
        </View>
        {message?.summary !== undefined && message.summary.trim().length > 0 ? <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>{message.summary}</Text> : null}
        {elapsed !== null ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: spacing.xs }}>
            <Clock3 color={colors.textFaint} size={14} />
            <Text style={{ color: colors.textFaint, fontSize: 11, marginLeft: 6 }}>{copy.workedFor(elapsed)}</Text>
          </View>
        ) : null}
        {message !== null && message.text.trim().length > 0 ? (
          <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginTop: spacing.sm, padding: spacing.xs2 }}>
            <Text selectable style={{ color: colors.textMuted, fontFamily: monospaceFont, fontSize: 11, lineHeight: 18 }}>{message.text}</Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.sm }}>{copy.toolDetailNote}</Text>
      </ScrollView>
    </Sheet>
  );
}
