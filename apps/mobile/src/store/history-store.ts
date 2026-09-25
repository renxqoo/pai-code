import { create } from 'zustand';
import { demoSessions } from '@/fixtures/demo-data';
import type { ConversationSession } from '@/types/domain';

type HistoryState = {
  sessions: readonly ConversationSession[];
  query: string;
  showArchived: boolean;
  setQuery: (query: string) => void;
  selectSession: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleUnread: (id: string) => void;
  archiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  toggleArchivedView: () => void;
};

const updateSession = (sessions: readonly ConversationSession[], id: string, update: (session: ConversationSession) => ConversationSession): ConversationSession[] =>
  sessions.map((session) => session.id === id ? update(session) : session);

export const useHistoryStore = create<HistoryState>((set) => ({
  sessions: demoSessions, query: '', showArchived: false,
  setQuery: (query) => set({ query: query.slice(0, 120) }),
  selectSession: (id) => set((state) => ({ sessions: state.sessions.map((session) => session.id === id ? { ...session, unread: false } : session) })),
  togglePinned: (id) => set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, pinned: !session.pinned })) })),
  toggleUnread: (id) => set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, unread: !session.unread })) })),
  archiveSession: (id) => set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, archived: !session.archived })) })),
  deleteSession: (id) => set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) })),
  renameSession: (id, title) => {
    const next = title.trim().slice(0, 80);
    if (next.length === 0) return;
    set((state) => ({ sessions: updateSession(state.sessions, id, (session) => ({ ...session, title: next })) }));
  },
  toggleArchivedView: () => set((state) => ({ showArchived: !state.showArchived })),
}));
