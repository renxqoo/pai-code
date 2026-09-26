import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';
import { toolStatusIcon } from '@/features/chat/tool-row';

const firstText = (...values: readonly (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? '';

type StatusLineProps = { message: ChatMessage };

export function StatusLine({ message }: StatusLineProps) {
  const { colors } = useAppTheme();
  const failed = message.status === 'error';
  const label = firstText(message.text, message.summary);
  const detail = firstText(message.summary);
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: rhythm.rowToRow, minHeight: 32 }}>
      {toolStatusIcon(message, failed ? colors.destructive : colors.textFaint)}
      <Text numberOfLines={1} style={{ color: failed ? colors.destructive : colors.textMuted, fontSize: 11, marginLeft: 8 }}>{label}</Text>
      {detail.length > 0 && detail !== label ? <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 10, marginLeft: 6 }}>{detail}</Text> : null}
    </View>
  );
}
