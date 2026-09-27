import * as React from 'react';
import { Text, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm, type } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import type { ChatMessage } from '@/types/domain';

const firstText = (...values: readonly (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? '';

type TurnFailureNoticeProps = { message: ChatMessage };

// 轮级失败终态：agent 停止于错误，与最终文本消息同位呈现（轮末），
// 不属于折叠头过程状态。
export function TurnFailureNotice({ message }: TurnFailureNoticeProps) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel={copy.activityFailed} style={{ marginTop: rhythm.turnGap }}>
      <View style={{ alignItems: 'center', flexDirection: 'row' }}>
        <CircleAlert color={colors.destructive} size={16} />
        <Text accessibilityRole="header" style={{ color: colors.destructive, fontSize: type.row.fontSize, fontWeight: '700', marginLeft: 8 }}>{copy.activityFailed}</Text>
      </View>
      <Text selectable style={{ color: colors.destructive, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight, marginTop: 6 }}>
        {firstText(message.text, message.summary)}
      </Text>
      {firstText(message.summary).length > 0 && firstText(message.summary) !== firstText(message.text) ? (
        <Text selectable style={{ color: colors.textMuted, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight, marginTop: 4 }}>{message.summary}</Text>
      ) : null}
    </View>
  );
}
