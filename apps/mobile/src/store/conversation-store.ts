import { create } from 'zustand';
import type { ChatMessage, ConversationSession } from '@/types/domain';

export type PermissionDecision = { id: string; title: string; command: string; approved: boolean | null };

type ConversationState = {
  activeSessionId: string | null;
  session: ConversationSession;
  workspaceId: string | null;
  permissionRequest: PermissionDecision | null;
  startNewSession: () => void;
  openSession: (session: ConversationSession) => void;
  appendMessage: (message: ChatMessage) => void;
  chooseWorkspace: (id: string, name: string) => void;
  requestPermission: (request: PermissionDecision) => void;
  resolvePermission: (approved: boolean) => void;
};

function blankSession(): ConversationSession {
  return { id: 'new-session', title: '新对话', preview: '', project: '未选择工作空间', timeLabel: '刚刚', state: 'idle', pinned: false, archived: false, unread: false, messages: [] };
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeSessionId: null, session: blankSession(), workspaceId: null, permissionRequest: null,
  startNewSession: () => set({ activeSessionId: null, session: blankSession(), permissionRequest: null }),
  openSession: (session) => set({ activeSessionId: session.id, session, permissionRequest: null }),
  appendMessage: (message) => set((state) => ({ session: { ...state.session, messages: [...state.session.messages, message], preview: message.text.slice(0, 80) } })),
  chooseWorkspace: (workspaceId, name) => set((state) => ({ workspaceId, session: { ...state.session, project: name } })),
  requestPermission: (permissionRequest) => set({ permissionRequest }),
  resolvePermission: (approved) => set((state) => state.permissionRequest === null ? state : { permissionRequest: { ...state.permissionRequest, approved } }),
}));
