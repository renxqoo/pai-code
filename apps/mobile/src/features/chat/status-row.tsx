import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Check, CircleAlert } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import { formatTimelineDuration } from '@/features/chat/timeline-duration';
import type { ChatMessage } from '@/types/domain';

type StatusRowProps = { message: ChatMessage };

export function StatusRow({ message }: StatusRowProps) {
  const { colors } = useAppTheme();
  const running = message.status === 'running';
  const failed = message.status === 'error';
  return (
    <View accessibilityLabel={message.text} style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, flexDirection: 'row', marginVertical: 6, minHeight: 42, paddingHorizontal: 12 }}>
      {running ? <ActivityIndicator color={colors.textMuted} size="small" /> : failed ? <CircleAlert color={colors.destructive} size={17} /> : <Check color={colors.success} size={17} />}
      <View style={{ flex: 1, marginLeft: 9 }}><Text style={{ color: failed ? colors.destructive : colors.text, fontSize: 12, fontWeight: '600' }}>{message.text}</Text>{message.summary ? <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{message.summary}</Text> : null}</View>
      {message.durationMs ? <Text style={{ color: colors.textFaint, fontSize: 10 }}>{formatTimelineDuration(message.durationMs)}</Text> : null}
    </View>
  );
}
