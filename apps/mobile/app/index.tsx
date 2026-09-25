import * as React from 'react';
import { ChatScreen } from '@/features/chat/chat-screen';
import { HistoryDrawer } from '@/features/history/history-drawer';
import { SessionSheet } from '@/features/history/session-sheet';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { AttachmentSheet } from '@/features/composer/attachment-sheet';
import { TaskSettingsSheet } from '@/features/composer/task-settings-sheet';
import { PermissionSheet } from '@/features/composer/permission-sheet';
import { ContextSheet } from '@/features/composer/context-sheet';

export default function IndexScreen() {
  return (
    <>
      <ChatScreen />
      <HistoryDrawer />
      <WorkspaceSheet />
      <AttachmentSheet />
      <TaskSettingsSheet />
      <PermissionSheet />
      <ContextSheet />
      <SessionSheet />
    </>
  );
}
