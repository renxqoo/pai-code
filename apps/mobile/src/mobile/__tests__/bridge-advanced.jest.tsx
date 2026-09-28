import { beforeEach, describe, expect, it } from '@jest/globals';

import { initializeBridge, attachThread, hydrateThread, loadBootstrap } from '../bridge-runtime';
import { setBridgeStorageDriver } from '../transport/bridge-storage';
import { useHistoryStore } from '@/store/history-store';
import { useConversationStore } from '@/store/conversation-store';

/** 事件回灌口（订阅路归一后的单一驱动面）。 */
function dispatch(event: unknown): void {
  const bridge = initializeBridge();
  const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
  client.dispatch(event);
}

describe('bridge-runtime 高级面', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setBridgeStorageDriver({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    });
    useHistoryStore.getState().replaceSessions([]);
  });

  it('sessionDied/sessionParked → 历史列表折叠为 parked 态', () => {
    dispatch({ type: 'sessionUpdated', session: { threadId: 't-die', title: 'D', cwd: '/d', state: 'live', streaming: false, model: null, thinkingLevel: null, sessionPath: null, lastActivityAt: 5 } });
    dispatch({ type: 'sessionDied', threadId: 't-die', reason: 'worker crash' });
    let sessions = useHistoryStore.getState().sessions;
    expect(sessions.find((session) => session.id === 't-die')?.state).toBe('paused');
    dispatch({ type: 'sessionParked', threadId: 't-die', reason: 'idle' });
    sessions = useHistoryStore.getState().sessions;
    expect(sessions.find((session) => session.id === 't-die')?.state).toBe('paused');
    initializeBridge().disconnect();
  });

  it('hydrateThread：断连（非 ready）早退——消息不被清（不崩）', async () => {
    attachThread('t-hy');
    useConversationStore.getState().appendMessages([{ id: 'keep', kind: 'user', text: 'keep', createdAt: '2026-01-01T00:00:00.000Z' }]);
    await hydrateThread('t-hy');
    // bridge 非 ready → invoke 拒 → seed 未执行 → 消息保留
    expect(useConversationStore.getState().session.messages.some((message) => message.id === 'keep')).toBe(true);
    attachThread(null);
  });

  it('loadBootstrap：invoke 失败（断连）→ 历史不被改写', async () => {
    const bridge = initializeBridge();
    await loadBootstrap(bridge.client);
    expect(useHistoryStore.getState().sessions).toEqual([]);
    bridge.disconnect();
  });

  it('activeThreadId null 时事件仍进归并（默认会话观察窗）', () => {
    attachThread(null);
    const bridge = initializeBridge();
    const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'userMessage', threadId: 't-any', message: { id: 'u9', text: 'observed', origin: 'user' } });
    expect(useConversationStore.getState().session.messages.some((message) => message.text === 'observed')).toBe(true);
    bridge.disconnect();
  });
});
