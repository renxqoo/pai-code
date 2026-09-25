import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { ArchiveAction } from '@/features/history/archive-action';
import { DeleteAction } from '@/features/history/delete-action';
import { PinAction } from '@/features/history/pin-action';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';

export function SessionSheet() {
  const { colors } = useAppTheme();
  const visible = useNavigationStore((state) => state.sheet === 'session-actions');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  const id = useConversationStore((state) => state.activeSessionId);
  const sessions = useHistoryStore((state) => state.sessions);
  const rename = useHistoryStore((state) => state.renameSession);
  const togglePin = useHistoryStore((state) => state.togglePinned);
  const archive = useHistoryStore((state) => state.archiveSession);
  const remove = useHistoryStore((state) => state.deleteSession);
  const session = sessions.find((item) => item.id === id);
  const [title, setTitle] = React.useState('');
  const close = () => { setTitle(''); closeSheet(); };
  return (
    <Sheet onClose={close} title={session === undefined ? '对话操作' : session.title} visible={visible}>
      <View style={{ paddingBottom: spacing.xs3 }}>
        {session === undefined ? <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: spacing.sm }}>新对话还没有需要管理的历史记录。</Text> : null}
        {session === undefined ? null : <TextField defaultValue={session.title} key={session.id} label="对话名称" onChangeText={setTitle} onSubmitEditing={() => { rename(session.id, title.trim() || session.title); close(); }} returnKeyType="done" />}
        <View style={{ height: 10 }} />
        <PinAction onPress={() => { if (session !== undefined) togglePin(session.id); close(); }} />
        <ArchiveAction onPress={() => { if (session !== undefined) archive(session.id); close(); }} />
        <DeleteAction onPress={() => { if (session !== undefined) remove(session.id); close(); }} />
      </View>
    </Sheet>
  );
}
