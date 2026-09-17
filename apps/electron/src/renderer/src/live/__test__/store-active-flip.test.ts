import { beforeEach, describe, expect, test } from 'bun:test';

import { store } from '@/live/workspace-runtime';
import type { SessionView, UiEvent } from '@paiapp/contracts';

/**
 * 活跃线程翻转的会话级视图失效（T33 M1 审查 #2 回归）：sessionPermissionMode/
 * commands/thinkingLevel 必须随 activeThreadId 的全部翻转路径同步清空——直写
 * activeThreadId 不带补丁的路径会让被移除会话的补全目录无限残留。
 */

function session(threadId: string): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: 1000,
  };
}

function updated(threadId: string): UiEvent {
  return { type: 'sessionUpdated', session: session(threadId) };
}

function removed(threadId: string): UiEvent {
  return { type: 'sessionRemoved', threadId };
}

beforeEach(() => {
  store.getState().reset();
});

describe('活跃线程翻转清空会话级视图', () => {
  test('setActiveThread：切会话同清 commands/thinkingLevel/sessionPermissionMode；同值重设不清', () => {
    store.getState().applyEvent(updated('a'), 0);
    store.getState().setActiveThread('a'); // 先成为活跃线程（null→a 本身是翻转）
    store.setState({ commands: [{ name: '/x', description: null, source: 'builtin' }], thinkingLevel: { level: 'high', source: 'session' }, sessionPermissionMode: { mode: 'default', source: 'session' } });
    store.getState().setActiveThread('a');
    expect(store.getState().commands).toHaveLength(1); // 同值不清
    store.getState().setActiveThread('b');
    const s = store.getState();
    expect(s.commands).toEqual([]);
    expect(s.thinkingLevel).toBe(null);
    expect(s.sessionPermissionMode).toBe(null);
  });

  test('sessionRemoved：移除活跃会话回落继任者/首会话时同清（不再残留被移除会话的目录）', () => {
    store.getState().applyEvent(updated('a'), 0);
    store.getState().applyEvent(updated('b'), 0);
    store.getState().setActiveThread('a');
    store.setState({ commands: [{ name: '/x', description: null, source: 'builtin' }], thinkingLevel: { level: 'high', source: 'session' }, sessionPermissionMode: { mode: 'default', source: 'session' } });
    store.getState().applyEvent(removed('a'), 1);
    const s = store.getState();
    expect(s.activeThreadId).toBe('b'); // 回落剩余会话
    expect(s.commands).toEqual([]);
    expect(s.thinkingLevel).toBe(null);
    expect(s.sessionPermissionMode).toBe(null);
  });

  test('sessionRemoved：移除最后一个会话（回落 null）也清空', () => {
    store.getState().applyEvent(updated('a'), 0);
    store.getState().setActiveThread('a');
    store.setState({ commands: [{ name: '/x', description: null, source: 'builtin' }], thinkingLevel: { level: 'high', source: 'session' } });
    store.getState().applyEvent(removed('a'), 1);
    const s = store.getState();
    expect(s.activeThreadId).toBe(null);
    expect(s.commands).toEqual([]);
    expect(s.thinkingLevel).toBe(null);
  });

  test('sessionRemoved：移除非活跃会话不清（活跃未翻转）', () => {
    store.getState().applyEvent(updated('a'), 0);
    store.getState().applyEvent(updated('b'), 0);
    store.getState().setActiveThread('a');
    store.setState({ commands: [{ name: '/x', description: null, source: 'builtin' }] });
    store.getState().applyEvent(removed('b'), 1);
    expect(store.getState().commands).toHaveLength(1);
    expect(store.getState().activeThreadId).toBe('a');
  });
});
