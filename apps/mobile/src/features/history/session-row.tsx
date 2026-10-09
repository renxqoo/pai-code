import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MoreHorizontal, Pin } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import type { ConversationSession } from '@/types/domain';

type SessionRowProps = { active?: boolean | undefined; session: ConversationSession; onOpen: () => void; onAction: () => void };

export function SessionRow({ active = false, session, onOpen, onAction }: SessionRowProps) {
  const { colors } = useAppTheme();
  const stateLabel = session.detached === true ? copy.detached : session.state === 'working' ? copy.running : session.state === 'paused' ? copy.paused : null;
  return (
    <Pressable accessibilityLabel={session.title} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onOpen} style={({ pressed }) => ({ backgroundColor: active ? colors.surfaceSubtle : 'transparent', borderRadius: radius.md, flexDirection: 'row', minHeight: 68, opacity: pressed ? 0.62 : 1, paddingLeft: 10, paddingVertical: 9 })}>
      {session.pinned ? <Pin color={colors.textFaint} fill={colors.textFaint} size={12} style={{ marginRight: 7, marginTop: 3 }} /> : null}
      <View style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 14, fontWeight: session.unread ? '700' : '500' }}>{session.title}</Text>
          {stateLabel ? <Text style={{ color: session.state === 'paused' || session.detached === true ? colors.destructive : colors.textMuted, fontSize: 10, fontWeight: '600', marginLeft: 8 }}>{stateLabel}</Text> : session.unread ? <View accessibilityLabel={copy.unread} accessibilityRole="text" accessible style={{ backgroundColor: colors.accent, borderRadius: 4, height: 6, marginLeft: 8, width: 6 }} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{session.preview}</Text>
        <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 10, marginTop: 4 }}>{[session.project, session.timeLabel].filter((part) => part.length > 0).join(' · ')}</Text>
      </View>
      <Pressable accessibilityLabel={`${session.title} 更多操作`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onAction(); }} style={{ alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }}><MoreHorizontal color={colors.textMuted} size={18} /></Pressable>
    </Pressable>
  );
}
