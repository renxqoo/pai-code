import { describe, expect, test } from 'bun:test';

import { createLiveStore } from '../store';
import type { SessionView, UiEvent } from '@paiapp/contracts';

const session = (threadId: string): SessionView => ({
  threadId,
  cwd: '/w',
  sessionPath: null,
  title: 'T',
  state: 'live',
  streaming: false,
  model: null,
  thinkingLevel: null,
  lastActivityAt: 1,
});

describe('live store（对话框/通知/bootstrap 合并）', () => {
  test('dialogRequest 入队 → dialogSettled 移除（ui_response 无事件回执，客户端自治结算）', () => {
    const store = createLiveStore();
    const request: UiEvent = { type: 'dialogRequest', threadId: 't', requestId: 'r1', method: 'confirm', message: 'm' };
    store.getState().applyEvent(request, 1);
    expect(store.getState().dialogOrder).toEqual(['r1']);
    store.getState().applyEvent({ type: 'dialogSettled', requestId: 'r1' }, 2);
    expect(store.getState().dialogOrder).toEqual([]);
    expect(Object.keys(store.getState().dialogs)).toEqual([]);
    // 未知 id 的 settle 无害
    store.getState().applyEvent({ type: 'dialogSettled', requestId: 'ghost' }, 3);
    expect(store.getState().dialogOrder).toEqual([]);
  });

  test('B-P6：notify 同 requestId 重投去重（与 dialog 路径对称）', () => {
    const store = createLiveStore();
    const notify = { type: 'dialogRequest', threadId: 't', requestId: 'n9', method: 'notify', message: 'm' } as const;
    store.getState().applyEvent(notify, 1);
    store.getState().applyEvent(notify, 2);
    expect(store.getState().notices).toEqual([{ id: 'n9', text: 'm' }]);
  });

  test('notify 走通知条不入对话框队列；setStatus 静默', () => {
    const store = createLiveStore();
    store.getState().applyEvent({ type: 'dialogRequest', threadId: 't', requestId: 'n1', method: 'notify', message: 'hello' }, 1);
    store.getState().applyEvent({ type: 'dialogRequest', threadId: 't', requestId: 's1', method: 'setStatus' }, 1);
    expect(store.getState().dialogOrder).toEqual([]);
    expect(store.getState().notices).toEqual([{ id: 'n1', text: 'hello' }]);
    store.getState().dismissNotice('n1');
    expect(store.getState().notices).toEqual([]);
  });

  test('bootstrap 合并在途线程状态（不重置已折叠的流式现场）', () => {
    const store = createLiveStore();
    store.getState().bootstrap({ sessions: [session('t1')], saved: [], models: [], providers: [], preferences: { defaultModel: 'glm/glm-4.7', onboarded: true, projectModels: {}, pinnedSessions: [] } });
    // 偏好随 bootstrap 快照折叠（defaultModel 透传，供 createSession 回落与向导判定）
    expect(store.getState().preferences).toEqual({ defaultModel: 'glm/glm-4.7', onboarded: true, projectModels: {}, pinnedSessions: [] });
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 5 }, 5);
    // 二次 bootstrap（StrictMode/重入）不得清掉流式状态
    store.getState().bootstrap({ sessions: [session('t1'), session('t2')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
    expect(store.getState().threads['t1']?.streaming).toBe(true);
    expect(store.getState().threads['t1']?.items.length).toBe(1);
    expect(store.getState().threads['t2']).toBeDefined();
    // 滞后快照不清在途会话（B-P5/P7 合并语义）：t1 保留，由 sessionRemoved 显式清理
    store.getState().bootstrap({ sessions: [session('t2')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
    expect(store.getState().threads['t1']).toBeDefined();
    expect(store.getState().sessions['t1']).toBeDefined();
    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 9);
    expect(store.getState().threads['t1']).toBeUndefined();
  });

  test('sessionRemoved 清线程与活跃指针', () => {
    const store = createLiveStore();
    store.getState().bootstrap({ sessions: [session('t1'), session('t2')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
    store.getState().setActiveThread('t1');
    store.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, 1);
    expect(store.getState().activeThreadId).not.toBe('t1');
    expect('t1' in store.getState().sessions).toBe(false);
  });

  test('host/sessionUpdated/sessionRenamed 会话表维护 + sessionDied 线程标记', () => {
    const store = createLiveStore();
    store.getState().bootstrap({ sessions: [session('t1')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
    store.getState().applyEvent({ type: 'host', phase: 'restarting' }, 1);
    expect(store.getState().hostPhase).toBe('restarting');
    store.getState().applyEvent({ type: 'sessionUpdated', session: { ...session('t1'), streaming: true } }, 2);
    expect(store.getState().sessions['t1']?.streaming).toBe(true);
    store.getState().applyEvent({ type: 'sessionRenamed', threadId: 't1', name: '新名' }, 3);
    expect(store.getState().sessions['t1']?.title).toBe('新名');
    // 未知线程的改名无操作
    store.getState().applyEvent({ type: 'sessionRenamed', threadId: 'ghost', name: 'x' }, 4);
    store.getState().applyEvent({ type: 'sessionDied', threadId: 't1', reason: 'crash' }, 5);
    expect(store.getState().threads['t1']?.crashed).toBe(true);
    // 未知线程的对话流事件兜底建线程（不崩溃）
    store.getState().applyEvent({ type: 'queueChanged', threadId: 'ghost', steering: [], followUp: ['m'] }, 6);
    expect(store.getState().threads['ghost']?.queue.followUp).toEqual(['m']);
  });

  test('hydrate/stopIntent/updateStats/reset 动作', () => {
    const store = createLiveStore();
    store.getState().bootstrap({ sessions: [session('t1')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
    store.getState().hydrate('t1', {
      kind: 'hydrate/initial',
      items: [{ kind: 'user', id: 'e1', text: 'hi', origin: 'user', at: 1 }],
      cursor: 'e1',
    });
    expect(store.getState().threads['t1']?.items.length).toBe(1);
    store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 2 }, 2);
    store.getState().stopIntent('t1');
    expect(store.getState().threads['t1']?.stopping).toBe(true);
    store.getState().updateStats('t1', { contextUsage: 0.5, tokensTotal: 100 });
    expect(store.getState().stats['t1']).toEqual({ contextUsage: 0.5, tokensTotal: 100 });
    store.getState().reset();
    expect(store.getState().bootstrapLoaded).toBe(false);
  });
});
