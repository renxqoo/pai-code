import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MoreHorizontal, Pin } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, radius } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import type { ConversationSession } from '@/types/domain';

/**
 * 会话行回调签名取「行内自带会话」而非「父级闭包」：抽屉的会话列表按会话对象
 * 逐条比对 props 决定重渲染，回调若每行新建一个闭包，memo 永远命中不了，
 * 一条会话变化会连带重渲染整屏原生视图。父级只需传稳定的函数引用。
 */
type SessionRowProps = {
  active?: boolean | undefined;
  /** 项目组内缩进（对齐文件夹行下的会话层级）。 */
  indent?: boolean | undefined;
  session: ConversationSession;
  onOpen: (session: ConversationSession) => void;
  onAction: (session: ConversationSession) => void;
};

function SessionRow({ active = false, indent = false, session, onOpen, onAction }: SessionRowProps) {
  const { colors } = useAppTheme();
  const stateLabel = session.detached === true ? copy.detached : session.state === 'working' ? copy.running : session.state === 'paused' ? copy.paused : null;
  return (
    <Pressable accessibilityLabel={session.title} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onOpen(session)} style={({ pressed }) => ({ backgroundColor: active ? colors.surfaceSubtle : 'transparent', borderRadius: radius.md, flexDirection: 'row', minHeight: 68, opacity: pressed ? 0.62 : 1, paddingLeft: indent ? layout.groupRowIndent : 10, paddingVertical: 9 })} testID="session-row">
      {session.pinned ? <Pin color={colors.textFaint} fill={colors.textFaint} size={12} style={{ marginRight: 7, marginTop: 3 }} /> : null}
      <View style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 14, fontWeight: session.unread ? '700' : '500' }}>{session.title}</Text>
          {stateLabel ? <Text style={{ color: session.state === 'paused' || session.detached === true ? colors.destructive : colors.textMuted, fontSize: 10, fontWeight: '600', marginLeft: 8 }}>{stateLabel}</Text> : session.unread ? <View accessibilityLabel={copy.unread} accessibilityRole="text" accessible style={{ backgroundColor: colors.accent, borderRadius: 4, height: 6, marginLeft: 8, width: 6 }} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{session.preview}</Text>
        <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 10, marginTop: 4 }}>{[session.project, session.timeLabel].filter((part) => part.length > 0).join(' · ')}</Text>
      </View>
      <Pressable accessibilityLabel={`${session.title} 更多操作`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onAction(session); }} style={{ alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }}><MoreHorizontal color={colors.textMuted} size={18} /></Pressable>
    </Pressable>
  );
}

const SessionRowMemo = React.memo(SessionRow);
export { SessionRowMemo as SessionRow };