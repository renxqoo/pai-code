/**
 * 历史同步（T57 §5）：bootstrap/listSaved 拉取 + sessionUpdated/Removed 事件维护 →
 * ConversationSession[]（history-store 消费模型）。
 * 置顶/归档是 app 偏好（preferences.pinnedSessions/archivedSessions——桌面端同源真相）。
 */
import type { ConversationSession } from '@/types/domain';

export interface HistorySyncCallbacks {
  onSessions(sessions: ConversationSession[]): void;
}

interface SessionLike {
  threadId?: string;
  cwd?: string;
  title?: string;
  state?: string;
  streaming?: boolean;
  model?: string | null;
  lastActivityAt?: number;
}

interface SavedLike {
  sessionPath?: string;
  sessionId?: string;
  title?: string;
  cwd?: string;
  lastActivityAt?: number;
}

const stateOf = (raw: string | undefined): ConversationSession['state'] => {
  if (raw === 'live') return 'working';
  if (raw === 'parked') return 'paused';
  return 'idle';
};

const timeLabelOf = (lastActivityAt: number): string => {
  const diff = Date.now() - lastActivityAt;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

export function toConversationSession(raw: SessionLike, pinned: boolean, archived: boolean): ConversationSession {
  const session: ConversationSession = {
    id: raw.threadId ?? '',
    title: raw.title ?? '未命名对话',
    preview: '',
    project: raw.cwd ?? '',
    timeLabel: timeLabelOf(raw.lastActivityAt ?? 0),
    state: stateOf(raw.state),
    pinned,
    archived,
    unread: false,
    messages: [],
  };
  if (raw.lastActivityAt !== undefined) {
    session.startedAtMs = raw.lastActivityAt;
    session.endedAtMs = raw.lastActivityAt;
  }
  return session;
}

export function createHistorySync(callbacks: HistorySyncCallbacks) {
  const sessions = new Map<string, ConversationSession>();

  const emit = (): void => {
    callbacks.onSessions([...sessions.values()].sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0)));
  };

  return {
    /** app/bootstrap.sessions + preferences（置顶/归档折叠）。 */
    seedBootstrap(list: SessionLike[], preferences: { pinnedSessions?: string[]; archivedSessions?: string[] }): void {
      sessions.clear();
      const pinnedPaths = new Set(preferences.pinnedSessions ?? []);
      const archivedPaths = new Set(preferences.archivedSessions ?? []);
      for (const raw of list) {
        const id = raw.threadId ?? '';
        if (id.length === 0) continue;
        sessions.set(id, toConversationSession(raw, pinnedPaths.has(raw.cwd ?? ''), archivedPaths.has(raw.cwd ?? '')));
      }
      emit();
    },
    /** 会话更新（sessionUpdated 事件）。 */
    updateSession(raw: SessionLike): void {
      const id = raw.threadId ?? '';
      if (id.length === 0) return;
      const existing = sessions.get(id);
      const next = toConversationSession(raw, existing?.pinned ?? false, existing?.archived ?? false);
      sessions.set(id, existing === undefined ? next : { ...next, pinned: existing.pinned, archived: existing.archived, messages: existing.messages, preview: existing.preview });
      emit();
    },
    /** 会话移除（sessionRemoved 事件 / session/stop remove）。 */
    removeSession(threadId: string): void {
      sessions.delete(threadId);
      emit();
    },
    /** 本地偏好变更（置顶/归档切换）。 */
    setLocalPreference(threadId: string, patch: { pinned?: boolean; archived?: boolean }): void {
      const existing = sessions.get(threadId);
      if (existing === undefined) return;
      sessions.set(threadId, { ...existing, ...patch });
      emit();
    },
    /** 打开会话时带消息（conversation-store 装载）。 */
    messagesOf(threadId: string): ConversationSession | undefined {
      return sessions.get(threadId);
    },
    snapshot(): ConversationSession[] {
      return [...sessions.values()];
    },
  };
}

/** saved 会话（listSaved）并入（去重 by threadId —— live 优先）。 */
export function mergeSaved(current: ConversationSession[], saved: SavedLike[]): ConversationSession[] {
  const live = new Set(current.map((session) => session.id));
  const extra: ConversationSession[] = [];
  for (const raw of saved) {
    const derived: ConversationSession = {
      id: raw.sessionId ?? raw.sessionPath ?? '',
      title: raw.title ?? '历史会话',
      preview: '',
      project: raw.cwd ?? '',
      timeLabel: timeLabelOf(raw.lastActivityAt ?? 0),
      state: 'paused',
      pinned: false,
      archived: false,
      unread: false,
      messages: [],
    };
    if (raw.lastActivityAt !== undefined) {
      derived.startedAtMs = raw.lastActivityAt;
      derived.endedAtMs = raw.lastActivityAt;
    }
    if (derived.id.length > 0 && !live.has(derived.id)) extra.push(derived);
  }
  return [...current, ...extra];
}
