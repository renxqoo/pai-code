import { describe, expect, test } from 'bun:test';

import { savedSessionEntries } from '../saved-views';
import type { SavedSessionView } from '@paiapp/contracts';

/** saved 视图映射：无名回落首条消息截 40（title 兜底单一真相）。 */

function saved(overrides: Partial<SavedSessionView> = {}): SavedSessionView {
  return {
    sessionPath: '/tmp/pai/s/a.jsonl',
    sessionId: 'a',
    cwd: '/tmp/pai',
    name: null,
    firstMessage: '第一条消息很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长',
    modifiedAt: 1000,
    messageCount: 3,
    ...overrides,
  };
}

describe('savedSessionEntries', () => {
  test('无名回落首条消息截 40；有名用名', () => {
    const [unnamed, named] = savedSessionEntries([saved(), saved({ name: '我的会话' })]);
    expect(unnamed.title).toHaveLength(40);
    expect(unnamed.title).toContain('第一条消息');
    expect(named.title).toBe('我的会话');
  });

  test('字段透传（sessionPath/cwd/modifiedAt/messageCount）', () => {
    const [entry] = savedSessionEntries([saved()]);
    expect(entry).toMatchObject({ sessionPath: '/tmp/pai/s/a.jsonl', cwd: '/tmp/pai', modifiedAt: 1000, messageCount: 3 });
  });

  test('空表空数组（同引用语义不强制）', () => {
    expect(savedSessionEntries([])).toEqual([]);
  });
});
