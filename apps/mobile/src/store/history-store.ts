import { create } from 'zustand';
import type { ConversationSession } from '@/types/domain';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { agentConversation } from '@/fixtures/agent-conversation';
import { demoSessions } from '@/fixtures/demo-data';

type HistoryState = {
  sessions: readonly ConversationSession[];
  query: string;
  setQuery: (query: string) => void;
  selectSession: (id: string) => void;
  togglePinned: (id: string) => void;
  archiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  /** bridge 数据源装载（真实会话列表整体替换）。 */
  replaceSessions: (sessions: readonly ConversationSession[]) => void;
};

const updateSession = (sessions: readonly ConversationSession[], id: string, update: (session: ConversationSession) => ConversationSession): ConversationSession[] =>
  sessions.map((session) => session.id === id ? update(session) : session);

/** 数据源：演示模式 = fixtures；连接模式 = bridge（replaceSessions 驱动）。 */
const initialSessions = (): readonly ConversationSession[] =>
  useDemoModeStore.getState().enabled ? [agentConversation, ...demoSessions] : [];

export const useHistoryStore = create<HistoryState>((set) => ({
  sessions: initialSessions(), query: '',
  setQuery: (query) => set({ query: query.slice(0, 120) }),
  selectSession: (id) => set((state) => ({ sessions: state.sessions.map((session) => session.id === id ? { ...session, unread: false } : session) })),
  togglePinned: (id) => set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, pinned: !session.pinned })) })),
  archiveSession: (id) => set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, archived: !session.archived })) })),
  deleteSession: (id) => set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) })),
  renameSession: (id, title) => {
    const next = title.trim().slice(0, 80);
    if (next.length === 0) return;
    set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, title: next })) }));
  },
  replaceSessions: (sessions) => set({ sessions }),
}));
