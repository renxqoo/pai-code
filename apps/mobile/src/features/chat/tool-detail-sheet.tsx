import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Wrench } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { formatElapsed } from '@/features/chat/format-elapsed';
import { monospaceFont } from '@/components/monospace-font';
import type { ChatMessage } from '@/types/domain';

type ToolDetailSheetProps = { message: ChatMessage | null; onClose: () => void };

export function ToolDetailSheet({ message, onClose }: ToolDetailSheetProps) {
  const { colors } = useAppTheme();
  if (message === null) return null;
  return (
    <Pressable accessibilityLabel="关闭工具详情" onPress={onClose} style={{ backgroundColor: colors.overlay, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
      <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, bottom: 0, left: 0, maxHeight: '70%', padding: spacing.xs4, position: 'absolute', right: 0 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <Wrench color={colors.textMuted} size={16} />
          <Text accessibilityRole="header" style={{ color: colors.text, flex: 1, fontSize: 15, fontWeight: '700', marginLeft: 8 }}>{copy.toolDetailTitle}</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: spacing.xs2 }}>{message.title ?? copy.toolDetailFallback}</Text>
        {message.summary !== undefined && message.summary.trim().length > 0 ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{message.summary}</Text> : null}
        {message.durationMs !== undefined && Number.isFinite(message.durationMs) && message.durationMs > 0 ? <Text style={{ color: colors.textFaint, fontSize: 10, marginTop: 2 }}>{copy.workedFor(formatElapsed(message.durationMs) ?? '')}</Text> : null}
        <Text selectable style={{ color: colors.textMuted, fontFamily: monospaceFont, fontSize: 11, lineHeight: 18, marginTop: spacing.xs }}>{message.text}</Text>
      </View>
    </Pressable>
  );
}
