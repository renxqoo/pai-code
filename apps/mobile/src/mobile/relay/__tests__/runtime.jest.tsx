import { beforeEach, describe, expect, it } from '@jest/globals';

import { initializeRelayRuntime, attachThread, entriesToMessages, hydrateThread } from '../runtime';
import { setRatchetKv } from '../credentials';
import * as conversationStoreModule from '@/store/conversation-store';
import * as historyStoreModule from '@/store/history-store';

function kvStub(): void {
  const map = new Map<string, string>();
  setRatchetKv({
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
  });
}

describe('relay runtime（T58 装配）', () => {
  beforeEach(() => {
    kvStub();
  });

  it('单例：两次初始化同实例；断连 disconnect 安全', () => {
    const a = initializeRelayRuntime();
    const b = initializeRelayRuntime();
    expect(a).toBe(b);
    expect(a.client).toBeTruthy();
    a.disconnect();
  });

  it('attachThread(null) 复位会话（不崩溃）', () => {
    attachThread(null);
    expect(true).toBe(true);
  });

  it('attachThread(id) 后非匹配线程事件不进消息流', () => {
    attachThread('t-active');
    const rt = initializeRelayRuntime();
    const client = rt.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'userMessage', threadId: 't-other', message: { id: 'u', text: 'x', origin: 'user' } });
    const { useConversationStore } = conversationStoreModule;
    expect(useConversationStore.getState().session.messages.some((m) => m.text === 'x')).toBe(false);
    attachThread(null);
  });

  it('sessionUpdated → 历史列表更新；sessionRemoved → 删行', () => {
    const { useHistoryStore } = historyStoreModule;
    const rt = initializeRelayRuntime();
    const client = rt.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'sessionUpdated', session: { threadId: 't-1', title: 'Relay 会话', cwd: '/p', state: 'live', streaming: false, model: null, thinkingLevel: null, sessionPath: '/s/1.jsonl', lastActivityAt: 1000 } });
    expect(useHistoryStore.getState().sessions.some((s) => s.title === 'Relay 会话')).toBe(true);
    client.dispatch({ type: 'sessionRemoved', threadId: 't-1' });
    expect(useHistoryStore.getState().sessions.some((s) => s.id === 't-1')).toBe(false);
  });
});

describe('entriesToMessages（随迁移规格基线）', () => {
  it('完整映射：thinking→text→tools 块序 + bash 三态 + images + 失败轮', () => {
    const messages = entriesToMessages([
      { kind: 'user', id: 'u1', text: '看图', at: 0, origin: 'user', images: [{ type: 'image', data: 'AAAA', mediaType: 'image/png' }] },
      { kind: 'assistant', id: 'a1', text: 'done', thinking: 'th', at: 0, toolCalls: [{ id: 'c1', name: 'bash', argsPreview: 'ls', output: 'f', isError: false }], stopReason: 'error', errorMessage: 'boom' },
      { kind: 'bash', id: 'b1', at: 0, command: 'ls', output: 'ok', exitCode: 0, cancelled: false, truncated: false },
      { kind: 'bash', id: 'b2', at: 0, command: 'x', output: 'err', exitCode: 3, cancelled: false, truncated: false },
      { kind: 'user', id: 'u2', text: '压缩', at: 0, meta: 'compaction-summary' },
    ]);
    const kinds = messages.map((m) => m.kind);
    expect(kinds).toEqual(['user', 'thinking', 'assistant', 'tool', 'status', 'tool', 'tool']);
    expect(messages[0]?.attachments?.[0]?.uri).toBe('data:image/png;base64,AAAA');
    expect(messages[4]).toMatchObject({ status: 'failed', text: 'boom' });
    expect(messages[6]).toMatchObject({ status: 'failed', exitCode: 3 });
    // compaction-summary 不出现
    expect(messages.some((m) => m.text === '压缩')).toBe(false);
  });

  it('垃圾条目跳过不崩', () => {
    expect(entriesToMessages([null, 42, 'x', { kind: 'unknown' }] as never)).toEqual([]);
  });
});


describe('relay runtime 路由与装配分支', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setRatchetKv({
      get: (key) => map.get(key) ?? null,
      set: (key, value) => {
        map.set(key, value);
      },
    });
  });

  it('sessionDied：活跃线程收敛一次（恰一次失败行）+ 历史列表 dead 态', () => {
    const rt = initializeRelayRuntime();
    const client = rt.client as unknown as { dispatch(rawEvent: unknown): void };
    attachThread('t-die');
    conversationStoreModule.useConversationStore.getState().openSession({ id: 't-die', title: 'D', preview: '', project: '', timeLabel: '', state: 'working', pinned: false, archived: false, unread: false, messages: [] });
    client.dispatch({ type: 'sessionUpdated', session: { threadId: 't-die', title: 'D', cwd: '/d', state: 'live', streaming: true, model: null, thinkingLevel: null, sessionPath: '/s/d.jsonl', lastActivityAt: 5 } });
    client.dispatch({ type: 'sessionDied', threadId: 't-die', reason: 'worker crash' });
    const messages = conversationStoreModule.useConversationStore.getState().session.messages;
    const failureRows = messages.filter((m) => m.kind === 'status' && m.text === 'session ended');
    expect(failureRows.length).toBe(1);
    expect(conversationStoreModule.useConversationStore.getState().session.messages.length).toBeGreaterThan(0);
    const { useHistoryStore } = historyStoreModule;
    expect(useHistoryStore.getState().sessions.find((s) => s.id === 't-die')?.state).toBe('idle');
    attachThread(null);
  });

  it('connectWithCredentials：无凭证时安全早退（不崩）', () => {
    const rt = initializeRelayRuntime();
    expect(() => rt.connectWithCredentials('whatever-token')).not.toThrow();
    rt.disconnect();
  });

  it('hydrateThread：断连（无连接）早退不清消息', async () => {
    attachThread('t-h');
    const { useConversationStore } = conversationStoreModule;
    useConversationStore.getState().appendMessages([{ id: 'keep', kind: 'user', text: 'keep', createdAt: '2026-01-01T00:00:00.000Z' }]);
    await hydrateThread('t-h');
    expect(useConversationStore.getState().session.messages.some((m) => m.id === 'keep')).toBe(true);
    attachThread(null);
  });

  it('dialogRequest/dialogSettled：权限卡置位与按 requestId 结算', () => {
    const rt = initializeRelayRuntime();
    const client = rt.client as unknown as { dispatch(rawEvent: unknown): void };
    client.dispatch({ type: 'dialogRequest', threadId: 't-x', requestId: 'r1', method: 'confirm', tool: 'bash', summary: '运行' });
    const { useConversationStore } = conversationStoreModule;
    expect(useConversationStore.getState().permissionRequest?.id).toBe('r1');
    client.dispatch({ type: 'dialogSettled', requestId: 'r1' });
    expect(useConversationStore.getState().permissionRequest).toBeNull();
  });
});
