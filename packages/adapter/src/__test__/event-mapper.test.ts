import { describe, expect, test } from 'bun:test';

import { mapSessionEvent, mapSubagentEvent } from '../event-mapper';
import { encodeCommand } from '../command-encoder';
import { mapDialogRequest } from '../dialog-mapper';
import type { AgentSessionEvent, SubagentEventFrame, UiRequestFrame } from '@paiapp/contracts';

const deps = { now: () => 1_000 };

function assistantMessage(partial: Record<string, unknown>): Record<string, unknown> {
  return { role: 'assistant', timestamp: 1234, content: [], usage: { input: 3, output: 4 }, ...partial };
}

describe('mapSessionEvent 全表', () => {
  test('agent_start → turnStarted', () => {
    expect(mapSessionEvent('t', { type: 'agent_start' }, deps)).toEqual([{ type: 'turnStarted', threadId: 't', at: 1000 }]);
  });

  test('message_start → messageStarted（timestamp 即消息 id）', () => {
    expect(mapSessionEvent('t', { type: 'message_start', message: assistantMessage({}) }, deps)).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: '1234', at: 1000 },
    ]);
  });

  test('message_update text_delta → textDelta（真实协议：partial/message 被剥离，id 为空串）', () => {
    const events = mapSessionEvent(
      't',
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '你好' },
      },
      deps,
    );
    expect(events).toEqual([{ type: 'textDelta', threadId: 't', messageId: '', delta: '你好' }]);
  });

  test('message_update thinking_delta → thinkingDelta（同样剥离形态）', () => {
    const events = mapSessionEvent(
      't',
      { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', contentIndex: 1, delta: 'hm' } },
      deps,
    );
    expect(events).toEqual([{ type: 'thinkingDelta', threadId: 't', messageId: '', delta: 'hm' }]);
  });

  test('回归：user 消息的 message_start/end 不产生渲染事件（pi 全消息发射）', () => {
    const userMsg = { role: 'user', content: 'hi', timestamp: 9 };
    expect(mapSessionEvent('t', { type: 'message_start', message: userMsg }, deps)).toEqual([]);
    expect(mapSessionEvent('t', { type: 'message_end', message: userMsg }, deps)).toEqual([]);
    const toolResult = { role: 'toolResult', toolCallId: 'c', toolName: 'bash', content: [], isError: false, timestamp: 10 };
    expect(mapSessionEvent('t', { type: 'message_start', message: toolResult }, deps)).toEqual([]);
    expect(mapSessionEvent('t', { type: 'message_end', message: toolResult }, deps)).toEqual([]);
  });

  test('message_update toolcall_end → toolCallAdded（bash 显示命令本体；write 带 diff）', () => {
    const bash = mapSessionEvent(
      't',
      {
        type: 'message_update',
        message: assistantMessage({}),
        assistantMessageEvent: { type: 'toolcall_end', contentIndex: 2, toolCall: { type: 'toolCall', id: 'tc1', name: 'bash', arguments: { command: 'git status' } } },
      },
      deps,
    );
    expect(bash).toEqual([{ type: 'toolCallAdded', threadId: 't', messageId: '1234', call: { id: 'tc1', name: 'bash', argsPreview: 'git status' }, diff: null }]);

    const write = mapSessionEvent(
      't',
      {
        type: 'message_update',
        message: assistantMessage({}),
        assistantMessageEvent: {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { type: 'toolCall', id: 'tc2', name: 'write', arguments: { path: 'a.ts', content: 'l1\nl2\nl3' } },
        },
      },
      deps,
    );
    expect(write[0]).toMatchObject({ type: 'toolCallAdded' });
    if (write[0]?.type === 'toolCallAdded') {
      expect(write[0].diff).toEqual([{ path: 'a.ts', additions: 3, deletions: 0 }]);
    }
  });

  test('message_update 其它段（start/end/done/error）→ 空', () => {
    for (const segment of ['start', 'text_start', 'text_end', 'thinking_start', 'thinking_end', 'toolcall_start', 'toolcall_delta', 'done', 'error']) {
      expect(
        mapSessionEvent('t', { type: 'message_update', message: assistantMessage({}), assistantMessageEvent: { type: segment } }, deps),
      ).toEqual([]);
    }
  });

  test('message_end → messageFinal（权威内容 + toolCalls + usage）', () => {
    const events = mapSessionEvent(
      't',
      {
        type: 'message_end',
        message: assistantMessage({
          content: [
            { type: 'thinking', thinking: 'plan' },
            { type: 'text', text: 'hello' },
            { type: 'toolCall', id: 'tc1', name: 'bash', arguments: { command: 'ls' } },
          ],
        }),
      },
      deps,
    );
    expect(events).toEqual([
      {
        type: 'messageFinal',
        threadId: 't',
        message: {
          id: '1234',
          text: 'hello',
          thinking: 'plan',
          toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'ls' }],
          usage: { input: 3, output: 4 },
        },
      },
    ]);
  });

  test('message_end 缺 usage → null', () => {
    const events = mapSessionEvent('t', { type: 'message_end', message: { role: 'assistant', timestamp: 1, content: [], usage: undefined } }, deps);
    if (events[0]?.type !== 'messageFinal') throw new Error('expected messageFinal');
    expect(events[0].message.usage).toBeNull();
  });

  test('tool_execution_update → toolUpdated', () => {
    const events = mapSessionEvent(
      't',
      { type: 'tool_execution_update', toolCallId: 'tc1', toolName: 'bash', args: {}, partialResult: { content: [{ type: 'text', text: 'run…' }], details: null } },
      deps,
    );
    expect(events).toEqual([{ type: 'toolUpdated', threadId: 't', callId: 'tc1', output: 'run…' }]);
  });

  test('tool_execution_end → toolEnded（edit 从 details.patch 提取 diff）', () => {
    const patch = ['--- a/x.ts', '+++ b/x.ts', '@@ -1,2 +1,3 @@', ' old', '+new', '+new2', '-gone'].join('\n');
    const events = mapSessionEvent(
      't',
      {
        type: 'tool_execution_end',
        toolCallId: 'tc9',
        toolName: 'edit',
        result: { content: [{ type: 'text', text: 'done' }], details: { diff: 'd', patch, firstChangedLine: 1 } },
        isError: false,
      },
      deps,
    );
    expect(events).toEqual([
      { type: 'toolEnded', threadId: 't', callId: 'tc9', output: 'done', isError: false, durationMs: 0, diff: [{ path: 'x.ts', additions: 2, deletions: 1 }] },
    ]);
  });

  test('agent_settled → turnSettled（usage null，用量由渲染层从 messageFinal 取）', () => {
    expect(mapSessionEvent('t', { type: 'agent_settled' }, deps)).toEqual([{ type: 'turnSettled', threadId: 't', usage: null }]);
  });

  test('queue_update → queueChanged（非字符串项过滤）', () => {
    expect(mapSessionEvent('t', { type: 'queue_update', steering: ['a', 2], followUp: [] }, deps)).toEqual([
      { type: 'queueChanged', threadId: 't', steering: ['a'], followUp: [] },
    ]);
  });

  test('compaction_start/end → compacting 翻转', () => {
    expect(mapSessionEvent('t', { type: 'compaction_start', reason: 'manual' }, deps)).toEqual([{ type: 'compacting', threadId: 't', active: true }]);
    expect(mapSessionEvent('t', { type: 'compaction_end', reason: 'manual', result: undefined, aborted: false, willRetry: false }, deps)).toEqual([
      { type: 'compacting', threadId: 't', active: false },
    ]);
  });

  test('auto_retry_start → retrying', () => {
    expect(mapSessionEvent('t', { type: 'auto_retry_start', attempt: 2, maxAttempts: 5, delayMs: 100, errorMessage: 'e' }, deps)).toEqual([
      { type: 'retrying', threadId: 't', attempt: 2, maxAttempts: 5, errorMessage: 'e' },
    ]);
  });

  test('session_info_changed → sessionRenamed（空名=清除→null）', () => {
    expect(mapSessionEvent('t', { type: 'session_info_changed', name: '新标题' }, deps)).toEqual([{ type: 'sessionRenamed', threadId: 't', name: '新标题' }]);
    expect(mapSessionEvent('t', { type: 'session_info_changed', name: undefined }, deps)).toEqual([{ type: 'sessionRenamed', threadId: 't', name: null }]);
  });

  test('bash_execution_update → bashOutput', () => {
    expect(mapSessionEvent('t', { type: 'bash_execution_update', id: 'b1', delta: 'out' }, deps)).toEqual([
      { type: 'bashOutput', threadId: 't', id: 'b1', delta: 'out' },
    ]);
  });

  test('忽略清单：turn_start/turn_end/agent_end/auto_retry_end/entry_appended/summarization_* → 空', () => {
    for (const event of [
      { type: 'turn_start' },
      { type: 'turn_end', message: {}, toolResults: [] },
      { type: 'agent_end', messages: [], willRetry: false },
      { type: 'auto_retry_end', success: true, attempt: 1 },
      { type: 'entry_appended', entry: { type: 'custom', id: 'e1' } },
      { type: 'summarization_retry_scheduled', attempt: 1, maxAttempts: 2, errorMessage: 'x' },
      { type: 'thinking_level_changed', level: 'high' },
      { type: 'mystery_event' },
    ] as AgentSessionEvent[]) {
      expect(mapSessionEvent('t', event, deps)).toEqual([]);
    }
  });
});

describe('mapSubagentEvent', () => {
  const frame = (event: Record<string, unknown>): SubagentEventFrame =>
    ({ type: 'subagent_event', threadId: 't', subagentId: 's1', agent: 'explore', task: 'scan', event }) as SubagentEventFrame;

  test('每帧都带头事件（upsert 语义）+ 流式增量', () => {
    const events = mapSubagentEvent(
      frame({ type: 'message_update', message: { timestamp: 9 }, assistantMessageEvent: { type: 'text_delta', delta: 'found' } }),
      deps,
    );
    expect(events).toEqual([
      { type: 'subagentStarted', threadId: 't', subagentId: 's1', agent: 'explore', task: 'scan' },
      { type: 'subagentDelta', threadId: 't', subagentId: 's1', delta: 'found' },
    ]);
  });

  test('tool_execution_start/update/end → subagentTool 三相', () => {
    expect(mapSubagentEvent(frame({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'bash', args: { command: 'ls' } }), deps)[1]).toMatchObject({
      type: 'subagentTool',
      phase: 'start',
      call: { id: 'c1', name: 'bash', argsPreview: 'ls' },
    });
    expect(
      mapSubagentEvent(frame({ type: 'tool_execution_update', toolCallId: 'c1', toolName: 'bash', partialResult: { content: [{ type: 'text', text: 'o' }] } }), deps)[1],
    ).toMatchObject({ type: 'subagentTool', phase: 'update', output: 'o' });
    expect(mapSubagentEvent(frame({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'bash', result: { content: [] }, isError: false }), deps)[1]).toMatchObject({
      type: 'subagentTool',
      phase: 'end',
      isError: false,
    });
  });

  test('agent_settled → subagentSettled；message_end → subagentText 权威替换', () => {
    expect(mapSubagentEvent(frame({ type: 'agent_settled' }), deps)).toEqual([
      { type: 'subagentStarted', threadId: 't', subagentId: 's1', agent: 'explore', task: 'scan' },
      { type: 'subagentSettled', threadId: 't', subagentId: 's1' },
    ]);
    const settled = mapSubagentEvent(frame({ type: 'message_end', message: { timestamp: 9, content: [{ type: 'text', text: 'summary' }] } }), deps);
    expect(settled[2]).toEqual({ type: 'subagentText', threadId: 't', subagentId: 's1', text: 'summary' });
  });

  test('其它事件（agent_start 等）→ 仅头事件', () => {
    expect(mapSubagentEvent(frame({ type: 'agent_start' }), deps)).toEqual([
      { type: 'subagentStarted', threadId: 't', subagentId: 's1', agent: 'explore', task: 'scan' },
    ]);
  });
});

describe('mapDialogRequest', () => {
  test('confirm 负载：title/message + 子代理身份', () => {
    const frame = {
      type: 'ui_request',
      requestId: 'r1',
      threadId: 't',
      method: 'confirm',
      title: 'Allow bash',
      message: 'npm test',
      subagentId: 's1',
      agent: 'explore',
    } as UiRequestFrame;
    expect(mapDialogRequest(frame)).toEqual({
      type: 'dialogRequest',
      threadId: 't',
      requestId: 'r1',
      method: 'confirm',
      title: 'Allow bash',
      message: 'npm test',
      options: undefined,
      placeholder: undefined,
      prefill: undefined,
      subagentId: 's1',
      agent: 'explore',
    });
  });

  test('select 的 options：字符串与 {label,value} 双形态都窄化为 label 列表', () => {
    const strings = mapDialogRequest({ type: 'ui_request', requestId: 'r', threadId: 't', method: 'select', options: ['a', 'b'] } as UiRequestFrame);
    expect(strings.options).toEqual(['a', 'b']);
    const objects = mapDialogRequest({
      type: 'ui_request',
      requestId: 'r',
      threadId: 't',
      method: 'select',
      options: [{ label: '甲', value: '1' }, { value: '2' }],
    } as unknown as UiRequestFrame);
    expect(objects.options).toEqual(['甲', '2']);
  });

  test('input placeholder / editor prefill 透传', () => {
    const input = mapDialogRequest({ type: 'ui_request', requestId: 'r', threadId: 't', method: 'input', title: 'T', placeholder: '输入' } as UiRequestFrame);
    expect(input.placeholder).toBe('输入');
    const editor = mapDialogRequest({ type: 'ui_request', requestId: 'r', threadId: 't', method: 'editor', title: 'T', prefill: 'x' } as UiRequestFrame);
    expect(editor.prefill).toBe('x');
  });
});

describe('encodeCommand', () => {
  test('命令 + id → JSONL 行', () => {
    const line = encodeCommand({ type: 'prompt', threadId: 't1', message: 'hi' }, '42');
    expect(JSON.parse(line)).toEqual({ type: 'prompt', threadId: 't1', message: 'hi', id: '42' });
    expect(line.endsWith('\n')).toBe(true);
  });
});
