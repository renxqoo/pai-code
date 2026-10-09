/**
 * 历史同步（T57 §5）：bootstrap/listSaved 拉取 + sessionUpdated/Removed 事件维护 →
 * ConversationSession[]（history-store 消费模型）。
 *
 * 键语义（对抗审查 H4 修复）：preferences.pinnedSessions/archivedSessions 的键是
 * **sessionPath**（PC 端真相——sidebar/build-pinned-list 同源），非 cwd。
 * 部分更新（对抗审查 H3 修复）：残缺视图（sessionDied 等）不覆盖既有 title/cwd/
 * lastActivityAt——逐字段缺席保留。
 * 状态映射（M9）：live+streaming=working、live=idle、parked=paused、dead=idle。
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
  sessionPath?: string | null;
  lastActivityAt?: number;
}

interface SavedLike {
  sessionPath?: string;
  sessionId?: string;
  title?: string;
  cwd?: string;
  lastActivityAt?: number;
}

const stateOf = (raw: SessionLike): ConversationSession['state'] => {
  if (raw.state === 'live') return raw.streaming === true ? 'working' : 'idle';
  if (raw.state === 'parked') return 'paused';
  return 'idle'; // dead：折叠为 idle（与 PC 不显示运行态一致）
};

const timeLabelOf = (lastActivityAt: number): string => {
  if (lastActivityAt <= 0) return '';
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
    state: stateOf(raw),
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
  /** sessionPath → threadId（偏好键反查：pinned/archived 键域是 sessionPath）。 */
  const pathIndex = new Map<string, string>();

  const emit = (): void => {
    callbacks.onSessions([...sessions.values()].sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0)));
  };

  const applyPreference = (raw: SessionLike, pinnedPaths: ReadonlySet<string>, archivedPaths: ReadonlySet<string>): { pinned: boolean; archived: boolean } => {
    const path = raw.sessionPath ?? null;
    const pinned = path !== null && pinnedPaths.has(path);
    const archived = path !== null && archivedPaths.has(path);
    return { pinned, archived };
  };

  return {
    /** app/bootstrap.sessions + saved + preferences（置顶/归档按 sessionPath 折叠）。 */
    seedBootstrap(list: SessionLike[], saved: SavedLike[], preferences: { pinnedSessions?: string[]; archivedSessions?: string[] }): void {
      sessions.clear();
      pathIndex.clear();
      const pinnedPaths = new Set(preferences.pinnedSessions ?? []);
      const archivedPaths = new Set(preferences.archivedSessions ?? []);
      for (const raw of list) {
        const id = raw.threadId ?? '';
        if (id.length === 0) continue;
        if (typeof raw.sessionPath === 'string') pathIndex.set(raw.sessionPath, id);
        const { pinned, archived } = applyPreference(raw, pinnedPaths, archivedPaths);
        sessions.set(id, toConversationSession(raw, pinned, archived));
      }
      // saved（已落盘不在册会话）并入去重（live 优先）。不在册 = 宿主表无表项，
      // 设备面既无 sessionPath 也唤不活 → 标 detached（UI 显式告知，不假装可用）。
      const liveIds = new Set([...sessions.keys()].values());
      for (const item of saved) {
        const sid = item.sessionId ?? '';
        if (sid.length === 0 || liveIds.has(sid)) continue;
        const archived = item.sessionPath !== undefined && archivedPaths.has(item.sessionPath);
        const row: SessionLike = { threadId: sid, state: 'parked' };
        if (item.title !== undefined) row.title = item.title;
        if (item.cwd !== undefined) row.cwd = item.cwd;
        if (item.lastActivityAt !== undefined) row.lastActivityAt = item.lastActivityAt;
        const derived = toConversationSession(row, false, archived);
        derived.detached = true;
        sessions.set(sid, derived);
      }
      emit();
    },
    /** 会话更新（sessionUpdated 事件；部分视图字段缺席时保留既有值）。 */
    updateSession(raw: SessionLike): void {
      const id = raw.threadId ?? '';
      if (id.length === 0) return;
      const existing = sessions.get(id);
      if (existing === undefined) {
        sessions.set(id, toConversationSession(raw, false, false));
        emit();
        return;
      }
      // 逐字段合并：残缺视图（sessionDied 只有 state）不清 title/cwd/时间
      const merged: ConversationSession = {
        ...existing,
        ...(raw.title !== undefined ? { title: raw.title } : {}),
        ...(raw.cwd !== undefined ? { project: raw.cwd } : {}),
        state: stateOf({ ...(raw.state !== undefined ? { state: raw.state } : {}), ...(raw.streaming !== undefined || raw.state === 'live' ? { streaming: raw.streaming ?? false } : {}) }),
      };
      if (raw.lastActivityAt !== undefined) {
        merged.startedAtMs = raw.lastActivityAt;
        merged.endedAtMs = raw.lastActivityAt;
        merged.timeLabel = timeLabelOf(raw.lastActivityAt);
      }
      sessions.set(id, merged);
      emit();
    },
    /** 会话移除（sessionRemoved 事件 / session/stop remove）。 */
    removeSession(threadId: string): void {
      sessions.delete(threadId);
      emit();
    },
    /** 本地偏好变更（置顶/归档切换——调用方负责同步 app/setPreference）。 */
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
    if (derived.id.length > 0 && !live.has(derived.id)) extra.push(derived);
  }
  return [...current, ...extra];
}
