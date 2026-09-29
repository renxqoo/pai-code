import { beforeEach, describe, expect, it } from '@jest/globals';

import { createSessionSync } from '../session-sync';
import type { ChatMessage } from '@/types/domain';

describe('session-sync 事件归并', () => {
  it('症状回归「历史先到后同条消息再上屏」：seed 后同 seq 的 userMessage 事件不重插', () => {
    const s = sync();
    s.seed([{ id: 'u-5', kind: 'user', text: '修复', createdAt: '2026-09-30T00:00:00Z' }] as ChatMessage[]);
    s.handleEvent({ type: 'userMessage', threadId: 't', message: { seq: 5, text: '修复', origin: 'user', images: [] } });
    expect(s.snapshot().messages).toHaveLength(1);
  });

  it('不同 seq 的同文本消息各自成条（身份按 seq 分域，不按文本合并）', () => {
    const s = sync();
    s.handleEvent({ type: 'userMessage', threadId: 't', message: { seq: 5, text: '继续', origin: 'user', images: [] } });
    s.handleEvent({ type: 'userMessage', threadId: 't', message: { seq: 9, text: '继续', origin: 'user', images: [] } });
    expect(s.snapshot().messages.map((m) => m.text)).toEqual(['继续', '继续']);
  });

  let dialogRequests: Array<{ requestId: string; title: string; command: string } | null>;
  let sessionEvents: Array<Record<string, unknown>>;

  beforeEach(() => {
    dialogRequests = [];
    sessionEvents = [];
  });

  const sync = () =>
    createSessionSync({
      onDialogRequest: (request) => dialogRequests.push(request),
      onSessionEvent: (event) => sessionEvents.push(event),
    });

  it('一轮完整旅程：userMessage → thinking/text delta → messageFinal → turnSettled', () => {
    const s = sync();
    s.handleEvent({ type: 'turnStarted', threadId: 't1', at: 1 });
    s.handleEvent({ type: 'userMessage', threadId: 't1', message: { seq: 5, text: 'hi', origin: 'user', images: [] } });
    s.handleEvent({ type: 'thinkingDelta', threadId: 't1', messageId: 'm1', delta: 'think ' });
    s.handleEvent({ type: 'thinkingDelta', threadId: 't1', messageId: 'm1', delta: 'more' });
    s.handleEvent({ type: 'textDelta', threadId: 't1', messageId: 'm1', delta: 'Hello' });
    s.handleEvent({ type: 'textDelta', threadId: 't1', messageId: 'm1', delta: ' world' });
    s.handleEvent({ type: 'messageFinal', threadId: 't1', message: { id: 'm1', text: 'Hello world!', thinking: 'think more', toolCalls: [] } });
    s.handleEvent({ type: 'turnSettled', threadId: 't1', ok: true });
    const { messages, streaming } = s.snapshot();
    expect(streaming).toBe(false);
    const kinds = messages.map((m) => m.kind);
    expect(kinds).toEqual(['user', 'thinking', 'assistant']);
    expect(messages[0]?.text).toBe('hi');
    expect(messages[1]?.text).toBe('think more');
    expect(messages[1]?.status).toBe('ok');
    expect(messages[2]?.text).toBe('Hello world!');
  });

  it('messageFinal 权威替换流式缓冲（终局文本覆盖累积 delta）', () => {
    const s = sync();
    s.handleEvent({ type: 'textDelta', threadId: 't', messageId: 'm', delta: 'partial' });
    s.handleEvent({ type: 'messageFinal', threadId: 't', message: { id: 'm', text: 'final text', thinking: '', toolCalls: [] } });
    const { messages } = s.snapshot();
    expect(messages[messages.length - 1]?.text).toBe('final text');
  });

  it('工具行：toolCallAdded → toolUpdated → toolEnded（失败态/时长）', () => {
    const s = sync();
    s.handleEvent({ type: 'toolCallAdded', threadId: 't', messageId: 'm', call: { id: 'c1', name: 'bash', argsPreview: 'ls -la' }, diff: null });
    s.handleEvent({ type: 'toolUpdated', threadId: 't', callId: 'c1', output: 'file1\nfile2' });
    s.handleEvent({ type: 'toolEnded', threadId: 't', callId: 'c1', output: 'file1\nfile2', isError: true, durationMs: 1200, diff: null });
    const { messages } = s.snapshot();
    const tool = messages.find((m) => m.kind === 'tool');
    expect(tool).toMatchObject({ toolName: 'bash', status: 'failed', durationMs: 1200, text: 'file1\nfile2' });
  });

  it('turnSettled 失败：残余 running 收敛为 stopped + 失败 status 行', () => {
    const s = sync();
    s.handleEvent({ type: 'turnStarted', threadId: 't', at: 1 });
    s.handleEvent({ type: 'thinkingDelta', threadId: 't', messageId: 'm', delta: 'x' });
    s.handleEvent({ type: 'turnSettled', threadId: 't', ok: false, reason: 'worker died' });
    const { messages, streaming } = s.snapshot();
    expect(streaming).toBe(false);
    expect(messages.some((m) => m.status === 'stopped')).toBe(true);
    const failure = messages.find((m) => m.kind === 'status');
    expect(failure?.text).toBe('worker died');
    expect(failure?.status).toBe('failed');
  });

  it('dialogRequest/dialogSettled → 权限卡片回调', () => {
    const s = sync();
    s.handleEvent({ type: 'dialogRequest', threadId: 't', requestId: 'r1', method: 'confirm', tool: 'bash', summary: '运行测试', reason: 'bun test' });
    expect(dialogRequests).toEqual([{ requestId: 'r1', title: '运行测试', command: 'bash\nbun test' }]);
    s.handleEvent({ type: 'dialogSettled', requestId: 'r1' });
    expect(dialogRequests[dialogRequests.length - 1]).toBeNull();
  });

  it('系统注入 userMessage 不进列表；streamRestarted 清流式缓冲', () => {
    const s = sync();
    s.handleEvent({ type: 'userMessage', threadId: 't', message: { seq: 6, text: 'notify', origin: 'system', images: [] } });
    s.handleEvent({ type: 'textDelta', threadId: 't', messageId: 'm', delta: 'attempt-1' });
    s.handleEvent({ type: 'streamRestarted', threadId: 't', messageId: 'm' });
    s.handleEvent({ type: 'textDelta', threadId: 't', messageId: 'm', delta: 'attempt-2' });
    const { messages } = s.snapshot();
    expect(messages.some((m) => m.kind === 'user')).toBe(false);
    expect(messages.find((m) => m.kind === 'assistant')?.text).toBe('attempt-2');
  });

  it('会话级事件外置（sessionUpdated 走 onSessionEvent）', () => {
    const s = sync();
    s.handleEvent({ type: 'sessionUpdated', session: { threadId: 't2' } });
    expect(sessionEvents.some((event) => event['type'] === 'sessionUpdated')).toBe(true);
  });

  it('seed 整体替换历史 + reset 清空', () => {
    const s = sync();
    const history: ChatMessage[] = [{ id: 'h1', kind: 'user', text: 'old', createdAt: '2026-01-01T00:00:00.000Z' }];
    s.seed(history);
    expect(s.snapshot().messages).toEqual(history);
    s.reset();
    expect(s.snapshot().messages).toEqual([]);
  });
});

describe('session-sync 边界分支', () => {
  const sink = () => {
    const dialogs: Array<unknown> = [];
    const outer: Array<Record<string, unknown>> = [];
    return { dialogs, outer };
  };

  it('textDelta 无 messageId 丢弃；空 delta 丢弃', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'textDelta', threadId: 't', messageId: '', delta: 'x' });
    s.handleEvent({ type: 'textDelta', threadId: 't', messageId: 'm', delta: '' });
    expect(s.snapshot().messages.length).toBe(0);
  });

  it('messageFinal 无消息对象丢弃；thinking 空时保留既有缓冲', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'messageFinal', threadId: 't' });
    s.handleEvent({ type: 'thinkingDelta', threadId: 't', messageId: 'm', delta: 'kept' });
    s.handleEvent({ type: 'messageFinal', threadId: 't', message: { id: 'm', text: '', thinking: '', toolCalls: [] } });
    // thinking 空 → 保留流式累积文本（previous.text）
    expect(s.snapshot().messages.find((m) => m.kind === 'thinking')?.text).toBe('kept');
  });

  it('toolCallAdded 无 call.id 丢弃；toolUpdated 未知 callId 无害', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'toolCallAdded', threadId: 't', messageId: 'm', call: { id: '', name: 'bash' }, diff: null });
    s.handleEvent({ type: 'toolUpdated', threadId: 't', callId: 'ghost', output: 'x' });
    s.handleEvent({ type: 'toolEnded', threadId: 't', callId: 'ghost', output: 'x', isError: false, durationMs: 1, diff: null });
    expect(s.snapshot().messages.length).toBe(0);
  });

  it('dialogRequest 无 requestId 丢弃', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'dialogRequest', threadId: 't', requestId: '', method: 'confirm' });
    expect(dialogs.length).toBe(0);
    void outer;
  });

  it('未知事件类型外置（onSessionEvent 兜底）', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'host', phase: 'ready' });
    expect(outer.some((event) => event['type'] === 'host')).toBe(true);
  });

  it('userMessage origin=system 不进列表（即使无 message 字段）', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'userMessage', threadId: 't', message: { seq: 7, text: 'n', origin: 'system', images: [] } });
    s.handleEvent({ type: 'userMessage', threadId: 't' });
    expect(s.snapshot().messages.length).toBe(0);
  });

  it('turnSettled ok=true：残余 running 态收敛为 ok（无失败行）', () => {
    const { dialogs, outer } = sink();
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: (e) => outer.push(e) });
    s.handleEvent({ type: 'thinkingDelta', threadId: 't', messageId: 'm', delta: 'x' });
    s.handleEvent({ type: 'turnSettled', threadId: 't', ok: true });
    const { messages } = s.snapshot();
    expect(messages.find((m) => m.kind === 'thinking')?.status).toBe('ok');
    expect(messages.some((m) => m.kind === 'status')).toBe(false);
  });

  it('dialogRequest title 回退链（summary 空用 tool+reason 组装）', () => {
    const dialogs: Array<unknown> = [];
    const s = createSessionSync({ onDialogRequest: (r) => dialogs.push(r), onSessionEvent: () => undefined });
    s.handleEvent({ type: 'dialogRequest', threadId: 't', requestId: 'r2', method: 'confirm', tool: 'bash', reason: 'rm -rf' });
    expect(dialogs[0]).toMatchObject({ requestId: 'r2', title: '确认操作', command: 'bash\nrm -rf' });
  });
});
