import * as React from 'react';
import { ChatScreen } from '@/features/chat/chat-screen';
import { HistoryDrawer } from '@/features/history/history-drawer';
import { SessionSheet } from '@/features/history/session-sheet';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { AttachmentSheet } from '@/features/composer/attachment-sheet';
import { PickerSheet } from '@/features/composer/picker-sheet';

export default function IndexScreen() {
  return (
    <>
      <ChatScreen />
      <HistoryDrawer />
      <WorkspaceSheet />
      <AttachmentSheet />
      <PickerSheet />
      <SessionSheet />
    </>
  );
}
