import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MoreHorizontal, Pin } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import type { ConversationSession } from '@/types/domain';

type SessionRowProps = { session: ConversationSession; onOpen: () => void; onAction: () => void };

export function SessionRow({ session, onOpen, onAction }: SessionRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityLabel={session.title} accessibilityRole="button" onPress={onOpen} style={({ pressed }) => ({ borderRadius: radius.md, flexDirection: 'row', minHeight: 64, opacity: pressed ? 0.62 : 1, paddingHorizontal: 10, paddingVertical: 10 })}>
      {session.pinned ? <Pin color={colors.textFaint} fill={colors.textFaint} size={13} style={{ marginRight: 7, marginTop: 3 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: session.unread ? '700' : '500' }}>{session.title}</Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 5 }}>{session.preview}</Text>
        <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: 7 }}><Text style={{ color: colors.textFaint, fontSize: 10 }}>{session.project} · {session.timeLabel}</Text>{session.state === 'working' ? <View style={{ backgroundColor: colors.accent, borderRadius: 4, height: 6, marginLeft: 7, width: 6 }} /> : null}</View>
      </View>
      {session.unread ? <View style={{ backgroundColor: colors.accent, borderRadius: 4, height: 7, marginRight: 8, marginTop: 7, width: 7 }} /> : null}
      <Pressable accessibilityLabel={`${session.title} 更多操作`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onAction(); }} style={{ padding: 5 }}><MoreHorizontal color={colors.textMuted} size={18} /></Pressable>
    </Pressable>
  );
}
