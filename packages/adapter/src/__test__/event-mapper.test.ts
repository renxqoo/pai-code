import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';
import { encodeCommand } from '../command-encoder';
import { mapDialogRequest } from '../dialog-mapper';
import type { EventMapper } from '../event-mapper';

const deps = { now: () => 1_000 };

type Frame = Parameters<EventMapper['mapEvent']>[0];

function frame(name: string, payload: Record<string, unknown>, agentName?: string): Frame {
  return { threadId: 't', name, payload, ...(agentName !== undefined ? { agentName } : {}) };
}

describe('createEventMapper · 主线程事件', () => {
  test('turn/start → turnStarted（payload.ts 缺省回落注入时钟）', () => {
    expect(createEventMapper(deps).mapEvent(frame('turn/start', { ts: 1234 }))).toEqual([
      { type: 'turnStarted', threadId: 't', at: 1234 },
    ]);
    expect(createEventMapper(deps).mapEvent(frame('turn/start', {}))).toEqual([
      { type: 'turnStarted', threadId: 't', at: 1000 },
    ]);
  });

  test('assistant/stream start → messageStarted 开缓冲（messageId 计数生成）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'start' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
    ]);
    // 第二轮 start 开新缓冲，计数递增不撞 id
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'start' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-2', at: 1000 },
    ]);
  });

  test('text/thinking 增量 → textDelta/thinkingDelta（同缓冲同 messageId，逐段透传）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'text', text: '你好' }))).toEqual([
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: '你好' },
    ]);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'thinking', text: '先想想' }))).toEqual([
      { type: 'thinkingDelta', threadId: 't', messageId: 'stream-1', delta: '先想想' },
    ]);
  });

  test('usage 段落不产事件（并入 done 的 messageFinal）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'usage', usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } }))).toEqual([]);
  });

  test('done → messageFinal（text/thinking 累积 + usage 视图 + toolCalls 空）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    mapper.mapEvent(frame('assistant/stream', { type: 'thinking', text: 'p' }));
    mapper.mapEvent(frame('assistant/stream', { type: 'text', text: 'a' }));
    mapper.mapEvent(frame('assistant/stream', { type: 'text', text: 'b' }));
    mapper.mapEvent(frame('assistant/stream', { type: 'usage', usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } }));
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'done', stopReason: 'stop' }))).toEqual([
      {
        type: 'messageFinal',
        threadId: 't',
        message: { id: 'stream-1', text: 'ab', thinking: 'p', toolCalls: [], usage: { input: 3, output: 4 } },
      },
    ]);
  });

  test('done 缺 usage（前面无 usage 段）→ messageFinal.usage null', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    const events = mapper.mapEvent(frame('assistant/stream', { type: 'done' }));
    expect(events).toEqual([
      { type: 'messageFinal', threadId: 't', message: { id: 'stream-1', text: '', thinking: '', toolCalls: [], usage: null } },
    ]);
  });

  test('症状回归：无 start 先到的 text 增量兜底开缓冲（messageStarted + delta 同批，不丢单词）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'text', text: 'hi' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: 'hi' },
    ]);
    // thinking 同样兜底
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'thinking', text: 'x' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-2', at: 1000 },
      { type: 'thinkingDelta', threadId: 't', messageId: 'stream-2', delta: 'x' },
    ]);
  });

  test('无缓冲时 usage/done 段 → 空（不凭空开缓冲）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } }))).toEqual([]);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'done' }))).toEqual([]);
  });

  test('assistant/stream 边界段（text_start/end、thinking_start/end、tool_use_*、error）→ 空', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    for (const segment of [
      { type: 'text_start' },
      { type: 'text_end' },
      { type: 'thinking_start' },
      { type: 'thinking_end' },
      { type: 'tool_use_start', id: 'tc1', name: 'bash' },
      { type: 'tool_use_input', id: 'tc1', inputDelta: '{"comm' },
      { type: 'tool_use_end', id: 'tc1' },
      { type: 'error', error: { code: 'x', message: 'm', retryable: false } },
    ]) {
      expect(mapper.mapEvent(frame('assistant/stream', segment))).toEqual([]);
    }
  });

  test('tool/start → toolCallAdded（bash 显示命令本体；write/edit 带参数 diff；agent 带 subagents）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));

    expect(
      mapper.mapEvent(frame('tool/start', { toolUseId: 'tc1', toolName: 'bash', input: { command: 'git status' } })),
    ).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: 'stream-1', call: { id: 'tc1', name: 'bash', argsPreview: 'git status' }, diff: null },
    ]);

    expect(
      mapper.mapEvent(frame('tool/start', { toolUseId: 'tc2', toolName: 'write_file', input: { path: 'a.ts', content: 'l1\nl2\nl3' } })),
    ).toEqual([
      {
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'stream-1',
        call: { id: 'tc2', name: 'write_file', argsPreview: 'a.ts' },
        diff: [{ path: 'a.ts', additions: 3, deletions: 0 }],
      },
    ]);

    expect(
      mapper.mapEvent(frame('tool/start', { toolUseId: 'tc3', toolName: 'edit_file', input: { path: 'b.ts', edits: [{ oldText: 'a\nb', newText: 'x' }] } })),
    ).toEqual([
      {
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'stream-1',
        call: { id: 'tc3', name: 'edit_file', argsPreview: 'b.ts' },
        diff: [{ path: 'b.ts', additions: 1, deletions: 2 }],
      },
    ]);

    expect(
      mapper.mapEvent(frame('tool/start', { toolUseId: 'tc4', toolName: 'agent', input: { prompt: '扫描现状', subagent_type: 'explore' } })),
    ).toEqual([
      {
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'stream-1',
        call: { id: 'tc4', name: 'agent', argsPreview: 'explore', subagents: [{ agent: 'explore', task: '扫描现状' }] },
        diff: null,
      },
    ]);
  });

  test('tool/start 无流缓冲（turn 外孤立到达）→ 空', () => {
    expect(createEventMapper(deps).mapEvent(frame('tool/start', { toolUseId: 'tc1', toolName: 'bash', input: { command: 'ls' } }))).toEqual([]);
  });

  test('tool/progress → toolUpdated（delta 文本）', () => {
    expect(createEventMapper(deps).mapEvent(frame('tool/progress', { toolUseId: 'tc1', delta: 'run…' }))).toEqual([
      { type: 'toolUpdated', threadId: 't', callId: 'tc1', output: 'run…' },
    ]);
  });

  test('tool/result → toolEnded（content 文本拼接、isError、durationMs；edit_file 从 details.patch 提 diff）', () => {
    const patch = ['--- a/x.ts', '+++ b/x.ts', '@@ -1,2 +1,3 @@', ' old', '+new', '+new2', '-gone'].join('\n');
    expect(
      createEventMapper(deps).mapEvent(
        frame('tool/result', {
          toolUseId: 'tc9',
          toolName: 'edit_file',
          content: [{ type: 'text', text: 'done' }, { type: 'text', text: 'ok' }],
          isError: true,
          durationMs: 42,
          details: { patch },
        }),
      ),
    ).toEqual([
      {
        type: 'toolEnded',
        threadId: 't',
        callId: 'tc9',
        output: 'done\nok',
        isError: true,
        durationMs: 42,
        diff: [{ path: 'x.ts', additions: 2, deletions: 1 }],
      },
    ]);

    // 非 edit_file / 无 details → diff null；非 text 块不计入 output；缺 durationMs 回落 0
    expect(
      createEventMapper(deps).mapEvent(
        frame('tool/result', { toolUseId: 'tc1', toolName: 'bash', content: [{ type: 'image', data: 'x', mediaType: 'image/png' }], isError: false }),
      ),
    ).toEqual([{ type: 'toolEnded', threadId: 't', callId: 'tc1', output: '', isError: false, durationMs: 0, diff: null }]);
  });

  test('settled → turnSettled（ok 仅 false 为假、reason 透传、usage 恒 null）并清流缓冲', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('settled', { ok: true, reason: '' }))).toEqual([{ type: 'turnSettled', threadId: 't', ok: true, usage: null }]);
    expect(mapper.mapEvent(frame('settled', { ok: false, reason: 'llm unavailable' }))).toEqual([
      { type: 'turnSettled', threadId: 't', ok: false, reason: 'llm unavailable', usage: null },
    ]);
    // ok 缺省视为成功（worker 合成终态无 ok 字段的防御）
    expect(mapper.mapEvent(frame('settled', {}))).toEqual([{ type: 'turnSettled', threadId: 't', ok: true, usage: null }]);
    // settled 清缓冲：后续孤立 tool/start 不再挂在旧缓冲上
    mapper.mapEvent(frame('assistant/stream', { type: 'start' }));
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(frame('tool/start', { toolUseId: 'tc1', toolName: 'bash', input: {} }))).toEqual([]);
  });

  test('compaction 单事件 → compacting(false) + compacted（host-hub 无 start/end 对）', () => {
    expect(createEventMapper(deps).mapEvent(frame('compaction', { replacedCount: 12 }))).toEqual([
      { type: 'compacting', threadId: 't', active: false },
      { type: 'compacted', threadId: 't', replacedCount: 12 },
    ]);
  });

  test('llm/retry → retrying（attempt 序号 + hub 错误文案）', () => {
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { attempt: 2, reason: 'rate_limited' }))).toEqual([
      { type: 'retrying', threadId: 't', attempt: 2, errorMessage: 'rate_limited' },
    ]);
  });

  test('bash_execution_update → bashOutput（id 缺省 null、truncated 仅 true 落位）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('bash_execution_update', { id: 'b1', delta: 'out' }))).toEqual([
      { type: 'bashOutput', threadId: 't', id: 'b1', delta: 'out' },
    ]);
    expect(mapper.mapEvent(frame('bash_execution_update', { delta: 'more' }))).toEqual([
      { type: 'bashOutput', threadId: 't', id: null, delta: 'more' },
    ]);
    expect(mapper.mapEvent(frame('bash_execution_update', { id: 'b1', delta: 'tail…', truncated: true }))).toEqual([
      { type: 'bashOutput', threadId: 't', id: 'b1', delta: 'tail…', truncated: true },
    ]);
    expect(mapper.mapEvent(frame('bash_execution_update', { id: 'b1', delta: 'x', truncated: false }))).toEqual([
      { type: 'bashOutput', threadId: 't', id: 'b1', delta: 'x' },
    ]);
  });

  test('忽略清单：结构信号/审计/前向兼容事件 → 空', () => {
    const mapper = createEventMapper(deps);
    for (const [name, payload] of [
      ['inbox/spliced', { spliced: 2 }],
      ['permission/decision', { decision: 'allow', toolName: 'bash' }],
      ['turn/end', { turnId: 1 }],
      ['step/start', { index: 0 }],
      ['step/end', { index: 0 }],
      ['hook/error', { hook: 'x' }],
      ['request/start', { id: 'r' }],
      ['plugin/loaded', { name: 'p' }],
      ['agents/idle', { agentName: 'a' }],
      ['agents/user-injected', { agentName: 'a', summary: 's' }],
      ['mystery_event', {}],
    ] as const) {
      expect(mapper.mapEvent(frame(name, payload))).toEqual([]);
    }
  });
});

describe('createEventMapper · 子代理分流（帧级 agentName）', () => {
  test('assistant/stream text → subagentDelta；其余段（start/thinking/done）不透传', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'text', text: 'found' }, 'explore'))).toEqual([
      { type: 'subagentDelta', threadId: 't', agentName: 'explore', delta: 'found' },
    ]);
    for (const segment of [{ type: 'start' }, { type: 'thinking', text: 'h' }, { type: 'done' }]) {
      expect(mapper.mapEvent(frame('assistant/stream', segment, 'explore'))).toEqual([]);
    }
  });

  test('tool/start|progress|result → subagentTool 三相（progress/result 的 argsPreview 置空）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('tool/start', { toolUseId: 'c1', toolName: 'bash', input: { command: 'ls' } }, 'explore'))).toEqual([
      { type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'bash', argsPreview: 'ls' }, phase: 'start' },
    ]);
    expect(mapper.mapEvent(frame('tool/progress', { toolUseId: 'c1', toolName: 'bash', delta: 'o' }, 'explore'))).toEqual([
      { type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'bash', argsPreview: '' }, phase: 'update', output: 'o' },
    ]);
    expect(
      mapper.mapEvent(frame('tool/result', { toolUseId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'done' }], isError: true }, 'explore')),
    ).toEqual([
      { type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'bash', argsPreview: '' }, phase: 'end', output: 'done', isError: true },
    ]);
  });

  test('agents/spawned → subagentStarted（task 空串 = 待快照回填）', () => {
    expect(createEventMapper(deps).mapEvent(frame('agents/spawned', { agentId: 'a1', agentName: 'explore', runId: 3 }, 'explore'))).toEqual([
      { type: 'subagentStarted', threadId: 't', agentId: 'a1', agentName: 'explore', task: '' },
    ]);
  });

  test('agents/state → subagentState（to=busy 为真、to=idle 为假）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agents/state', { agentName: 'explore', from: 'idle', to: 'busy' }, 'explore'))).toEqual([
      { type: 'subagentState', threadId: 't', agentName: 'explore', busy: true },
    ]);
    expect(mapper.mapEvent(frame('agents/state', { agentName: 'explore', from: 'busy', to: 'idle' }, 'explore'))).toEqual([
      { type: 'subagentState', threadId: 't', agentName: 'explore', busy: false },
    ]);
  });

  test('agents/terminal → subagentSettled（status 词表原文透传）；agents/evicted → status=evicted', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agents/terminal', { agentName: 'explore', status: 'completed' }, 'explore'))).toEqual([
      { type: 'subagentSettled', threadId: 't', agentName: 'explore', status: 'completed' },
    ]);
    expect(mapper.mapEvent(frame('agents/evicted', { agentName: 'explore', reason: 'lru' }, 'explore'))).toEqual([
      { type: 'subagentSettled', threadId: 't', agentName: 'explore', status: 'evicted' },
    ]);
  });

  test('agents/permission-ask → subagentAsk（reason 可选携带）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agents/permission-ask', { agentName: 'explore', askId: 'k1', toolName: 'bash', summary: 'rm -rf /tmp/x' }, 'explore'))).toEqual([
      { type: 'subagentAsk', threadId: 't', agentName: 'explore', toolName: 'bash', summary: 'rm -rf /tmp/x' },
    ]);
    expect(mapper.mapEvent(frame('agents/permission-ask', { agentName: 'explore', toolName: 'bash', summary: 's', reason: 'network' }, 'explore'))).toEqual([
      { type: 'subagentAsk', threadId: 't', agentName: 'explore', toolName: 'bash', summary: 's', reason: 'network' },
    ]);
  });

  test('子代理域其余事件（agents/idle、settled、turn/*）→ 空', () => {
    const mapper = createEventMapper(deps);
    for (const [name, payload] of [
      ['agents/idle', { agentName: 'explore' }],
      ['settled', { ok: true }],
      ['turn/start', { ts: 1 }],
      ['bash_execution_update', { delta: 'x' }],
    ] as const) {
      expect(mapper.mapEvent(frame(name, payload, 'explore'))).toEqual([]);
    }
  });

  test('agentName 空串视为主线程（无中继身份语义）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/stream', { type: 'text', text: 'hi' }, ''))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: 'hi' },
    ]);
  });
});

describe('mapDialogRequest', () => {
  test('confirm 载荷平铺帧上：tool/summary/reason + 子代理身份', () => {
    expect(
      mapDialogRequest({ type: 'ui_request', requestId: 'r1', threadId: 't', method: 'confirm', tool: 'bash', summary: 'npm test', reason: 'net', agentName: 'explore' }),
    ).toEqual({
      type: 'dialogRequest',
      threadId: 't',
      requestId: 'r1',
      method: 'confirm',
      tool: 'bash',
      summary: 'npm test',
      reason: 'net',
      agentName: 'explore',
    });
  });

  test('method 缺省 → confirm；空字段收窄 undefined；无 agentName 不携带', () => {
    expect(mapDialogRequest({ type: 'ui_request', requestId: 'r', threadId: 't' })).toEqual({
      type: 'dialogRequest',
      threadId: 't',
      requestId: 'r',
      method: 'confirm',
      tool: undefined,
      summary: undefined,
      reason: undefined,
    });
  });
});

describe('encodeCommand', () => {
  test('命令 + id → JSONL 行', () => {
    const line = encodeCommand({ type: 'prompt', threadId: 't1', message: 'hi' }, '42');
    expect(JSON.parse(line)).toEqual({ type: 'prompt', threadId: 't1', message: 'hi', id: '42' });
    expect(line.endsWith('\n')).toBe(true);
  });
});
