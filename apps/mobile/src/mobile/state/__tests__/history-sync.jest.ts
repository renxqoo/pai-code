import { beforeEach, describe, expect, it } from '@jest/globals';

import { createHistorySync, mergeSaved } from '../history-sync';
import type { ConversationSession } from '@/types/domain';

describe('history-sync', () => {
  let emitted: ConversationSession[][];

  beforeEach(() => {
    emitted = [];
  });

  const sync = () =>
    createHistorySync({
      onSessions: (sessions) => emitted.push(sessions),
    });

  it('seedBootstrap：live 会话列表 + 偏好折叠（置顶/归档）；按活跃时间排序', () => {
    const s = sync();
    s.seedBootstrap(
      [
        { threadId: 't1', title: 'A', cwd: '/a', state: 'live', lastActivityAt: 100 },
        { threadId: 't2', title: 'B', cwd: '/b', state: 'parked', lastActivityAt: 200 },
      ],
      { pinnedSessions: ['/a'], archivedSessions: ['/b'] },
    );
    const sessions = emitted[emitted.length - 1] ?? [];
    expect(sessions.map((x) => x.id)).toEqual(['t2', 't1']); // 200 > 100
    expect(sessions.find((x) => x.id === 't1')?.pinned).toBe(true);
    expect(sessions.find((x) => x.id === 't2')?.archived).toBe(true);
    expect(sessions.find((x) => x.id === 't2')?.state).toBe('paused');
  });

  it('updateSession 保持既有偏好与消息；removeSession 删行', () => {
    const s = sync();
    s.seedBootstrap([{ threadId: 't1', title: 'A', cwd: '/a', state: 'live', lastActivityAt: 1 }], { pinnedSessions: ['/a'], archivedSessions: [] });
    s.setLocalPreference('t1', { pinned: true });
    s.updateSession({ threadId: 't1', title: 'A2', state: 'live', lastActivityAt: 5 });
    let sessions = emitted[emitted.length - 1] ?? [];
    expect(sessions.find((x) => x.id === 't1')?.title).toBe('A2');
    expect(sessions.find((x) => x.id === 't1')?.pinned).toBe(true);
    s.removeSession('t1');
    sessions = emitted[emitted.length - 1] ?? [];
    expect(sessions.length).toBe(0);
  });

  it('mergeSaved：历史会话并入去重（live 优先）', () => {
    const live: ConversationSession[] = [{ id: 't1', title: 'live', preview: '', project: '', timeLabel: '', state: 'working', pinned: false, archived: false, unread: false, messages: [] }];
    const merged = mergeSaved(live, [{ sessionId: 't1', sessionPath: '/p1', title: 'dup' }, { sessionId: 't9', sessionPath: '/p9', title: 'old', lastActivityAt: 42 }]);
    expect(merged.map((x) => x.id).slice().sort((a, b) => a.localeCompare(b))).toEqual(['t1', 't9']);
    expect(merged.find((x) => x.id === 't9')?.state).toBe('paused');
  });
});
