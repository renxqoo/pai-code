import { describe, expect, test } from 'bun:test';

import { excludeArchivedSessions } from '../exclude-archived';
import type { SessionCardModel } from '@/sidebar/session-card-model';

function card(id: string, sessionPath: string | null): SessionCardModel {
  return { id, projectName: 'p', title: id, version: '', cwd: '/w', sessionPath, streaming: false, lastActivityAt: 0 };
}

describe('excludeArchivedSessions', () => {
  test('按 sessionPath 键排除；空集合同引用返回', () => {
    const sessions = [card('a', '/s/a.jsonl'), card('b', '/s/b.jsonl'), card('c', null)];
    const archived = new Set(['/s/a.jsonl']);
    expect(excludeArchivedSessions(sessions, archived).map((session) => session.id)).toEqual(['b', 'c']);
    expect(excludeArchivedSessions(sessions, new Set())).toBe(sessions);
  });

  test('sessionPath 为 null 的会话不受归档键影响（无文件不可能被标记）', () => {
    const sessions = [card('c', null)];
    expect(excludeArchivedSessions(sessions, new Set(['whatever']))).toEqual(sessions);
  });
});
