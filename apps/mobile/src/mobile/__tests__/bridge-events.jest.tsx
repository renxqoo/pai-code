import { beforeEach, describe, expect, it } from '@jest/globals';

/**
 * bridge 事件路由（routeEvent + onEvent 管线）：经 initializeBridge 的 transport
 * 事件回灌驱动——session-sync 归并进活跃会话 + 会话级事件外置到 history-sync。
 */
import { initializeBridge, attachThread } from '../bridge-runtime';
import { setBridgeStorageDriver } from '../transport/bridge-storage';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';

/** 事件回灌口：transport.onEvent 回调在 createWsTransport 内——经 runtime 内部句柄触发。
 *  测试经 client.dispatch 不可达（那是订阅侧）——用事件泵入口：直接调 transport 层。 */
describe('bridge 事件管线（端到端回灌）', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setBridgeStorageDriver({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    });
    useHistoryStore.getState().replaceSessions([]);
  });

  it('sessionUpdated 事件 → 历史列表更新', () => {
    const bridge = initializeBridge();
    // 经 dispatch 面（BridgeClient.dispatch 是事件泵入口）
    const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'sessionUpdated', session: { threadId: 't-sync', title: 'Sync', cwd: '/s', state: 'live', streaming: false, model: null, thinkingLevel: null, sessionPath: null, lastActivityAt: 1000 } });
    const sessions = useHistoryStore.getState().sessions;
    expect(sessions.some((session) => session.id === 't-sync' && session.title === 'Sync')).toBe(true);
    bridge.disconnect();
  });

  it('sessionRemoved 事件 → 历史列表删行', () => {
    const bridge = initializeBridge();
    const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'sessionUpdated', session: { threadId: 't-rm', title: 'RM', cwd: '/r', state: 'live', streaming: false, model: null, thinkingLevel: null, sessionPath: null, lastActivityAt: 1 } });
    client.dispatch({ type: 'sessionRemoved', threadId: 't-rm' });
    expect(useHistoryStore.getState().sessions.some((session) => session.id === 't-rm')).toBe(false);
    bridge.disconnect();
  });

  it('会话流事件（活跃线程）→ 对话消息归并 + dialogRequest 权限卡', () => {
    const bridge = initializeBridge();
    attachThread('t-live');
    useConversationStore.getState().openSession({ id: 't-live', title: 'L', preview: '', project: '', timeLabel: '', state: 'working', pinned: false, archived: false, unread: false, messages: [] });
    const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'userMessage', threadId: 't-live', message: { id: 'u1', text: 'hello', origin: 'user' } });
    client.dispatch({ type: 'textDelta', threadId: 't-live', messageId: 'm1', delta: 'resp' });
    client.dispatch({ type: 'messageFinal', threadId: 't-live', message: { id: 'm1', text: 'resp full', thinking: '', toolCalls: [], usage: null } });
    client.dispatch({ type: 'turnSettled', threadId: 't-live', ok: true, usage: null });
    const messages = useConversationStore.getState().session.messages;
    expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant']);

    expect(messages[1]?.text).toBe('resp full');
    // 权限卡
    client.dispatch({ type: 'dialogRequest', threadId: 't-live', requestId: 'r1', method: 'confirm', tool: 'bash', summary: '运行' });
    expect(useConversationStore.getState().permissionRequest?.id).toBe('r1');
    client.dispatch({ type: 'dialogSettled', requestId: 'r1' });
    expect(useConversationStore.getState().permissionRequest).toBeNull();
    bridge.disconnect();
    attachThread(null);
  });

  it('非活跃线程事件不进消息流', () => {
    const bridge = initializeBridge();
    attachThread('t-active');
    const client = bridge.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'userMessage', threadId: 't-other', message: { id: 'u2', text: 'elsewhere', origin: 'user' } });
    expect(useConversationStore.getState().session.messages.some((message) => message.text === 'elsewhere')).toBe(false);
    bridge.disconnect();
    attachThread(null);
  });
});
