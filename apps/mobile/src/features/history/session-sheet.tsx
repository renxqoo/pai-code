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
import { useDemoModeStore } from '@/store/demo-mode-store';
import { attachThread, getBridge, preferenceToggle } from '@/mobile/bridge-runtime';

/**
 * 会话操作：本地 store 即时反馈 + 连接模式同步 hub（改名 session/setName、
 * 删除 session/stop remove=true；置顶/归档是 app 偏好——桌面端偏好集，一期本地）。
 */
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
  const startNewSession = useConversationStore((state) => state.startNewSession);
  const session = sessions.find((item) => item.id === id);
  const [title, setTitle] = React.useState('');
  const close = () => { setTitle(''); closeSheet(); };

  const bridgeReady = (): boolean => {
    if (useDemoModeStore.getState().enabled) return false;
    const bridge = getBridge();
    return bridge?.status === 'ready';
  };

  /** 偏好写回（置顶/归档）：app/setPreference 与 PC 同源（pinnedSessions/archivedSessions
   *  键域 sessionPath）——本地乐观更新 + 服务端真相回填。 */
  const togglePreference = (kind: 'pinned' | 'archived'): void => {
    if (session === undefined) return;
    if (!bridgeReady() || id === null) {
      // 演示/断连：仅本地
      if (kind === 'pinned') togglePin(session.id);
      else archive(session.id);
      return;
    }
    void preferenceToggle(id, kind).then(() => {
      if (kind === 'pinned') togglePin(session.id);
      else archive(session.id);
    });
  };

  const renameRemote = (): void => {
    if (session === undefined) return;
    const next = title.trim() || session.title;
    rename(session.id, next);
    if (bridgeReady() && id !== null) void getBridge()?.client.invoke('session/setName', { threadId: id, name: next });
    close();
  };

  const deleteRemote = (): void => {
    if (session === undefined) return;
    remove(session.id);
    if (bridgeReady() && id !== null) {
      void getBridge()?.client.invoke('session/stop', { threadId: id, remove: true });
      // 删除的是活跃会话：回到空白新会话
      attachThread(null);
      startNewSession();
    }
    close();
  };

  return (
    <Sheet onClose={close} title={session === undefined ? '对话操作' : session.title} visible={visible}>
      <View style={{ paddingBottom: spacing.xs3 }}>
        {session === undefined ? <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: spacing.sm }}>新对话还没有需要管理的历史记录。</Text> : null}
        {session === undefined ? null : <TextField defaultValue={session.title} key={session.id} label="对话名称" onChangeText={setTitle} onSubmitEditing={renameRemote} returnKeyType="done" />}
        <View style={{ height: 10 }} />
        <PinAction onPress={() => { togglePreference('pinned'); close(); }} />
        <ArchiveAction onPress={() => { togglePreference('archived'); close(); }} />
        <DeleteAction onPress={deleteRemote} />
      </View>
    </Sheet>
  );
}
