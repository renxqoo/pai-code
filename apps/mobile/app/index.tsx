import * as React from 'react';
import { ChatScreen } from '@/features/chat/chat-screen';
import { HistoryDrawer } from '@/features/history/history-drawer';
import { SessionSheet } from '@/features/history/session-sheet';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { AttachmentSheet } from '@/features/composer/attachment-sheet';
import { TaskConfigSheet } from '@/features/composer/task-config-sheet';
import { ToolDetailSheet } from '@/features/chat/tool-detail-sheet';
import { FileDiffSheet } from '@/features/chat/file-diff-sheet';

export default function IndexScreen() {
  return (
    <>
      <ChatScreen />
      <HistoryDrawer />
      <WorkspaceSheet />
      <AttachmentSheet />
      <TaskConfigSheet />
      <ToolDetailSheet />
      <FileDiffSheet />
      <SessionSheet />
    </>
  );
}
