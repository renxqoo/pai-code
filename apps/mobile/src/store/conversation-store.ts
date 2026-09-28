import { create } from 'zustand';
import type { ChatMessage, ConversationSession } from '@/types/domain';

export type PermissionDecision = { id: string; title: string; command: string; approved: boolean | null };

type ConversationState = {
  activeSessionId: string | null;
  session: ConversationSession;
  workspaceId: string | null;
  /** 活跃权限卡（多会话并发时按 requestId 区分；单卡视图取首项）。 */
  permissionRequest: PermissionDecision | null;
  startNewSession: () => void;
  openSession: (session: ConversationSession) => void;
  appendMessage: (message: ChatMessage) => void;
  /** bridge 会话流整体替换（事件归并器驱动——权威模型，append 只服务演示模式）。 */
  appendMessages: (messages: readonly ChatMessage[]) => void;
  chooseWorkspace: (id: string, name: string) => void;
  requestPermission: (request: PermissionDecision) => void;
  resolvePermission: (approved: boolean) => void;
  clearPermission: () => void;
  /** 按 requestId 结算（dialogSettled 对账——只清对应卡）。 */
  settlePermission: (requestId: string) => void;
};

function blankSession(): ConversationSession {
  return { id: 'new-session', title: '新对话', preview: '', project: '未选择工作空间', timeLabel: '刚刚', state: 'idle', pinned: false, archived: false, unread: false, messages: [] };
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeSessionId: null, session: blankSession(), workspaceId: null, permissionRequest: null,
  startNewSession: () => set({ activeSessionId: null, session: blankSession(), permissionRequest: null }),
  openSession: (session) => set({ activeSessionId: session.id, session, permissionRequest: null }),
  appendMessage: (message) => set((state) => ({ session: { ...state.session, messages: [...state.session.messages, message], preview: message.text.slice(0, 80) } })),
  appendMessages: (messages) => set((state) => ({ session: { ...state.session, messages, preview: messages.length > 0 ? (messages[messages.length - 1]?.text ?? '').slice(0, 80) : state.session.preview } })),
  chooseWorkspace: (workspaceId, name) => set((state) => ({ workspaceId, session: { ...state.session, project: name } })),
  requestPermission: (permissionRequest) => set({ permissionRequest }),
  resolvePermission: (approved) => set((state) => state.permissionRequest === null ? state : { permissionRequest: { ...state.permissionRequest, approved } }),
  clearPermission: () => set({ permissionRequest: null }),
  settlePermission: (requestId) => set((state) => (state.permissionRequest?.id === requestId ? { permissionRequest: null } : state)),
}));
