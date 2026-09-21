import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';
import { encodeCommand } from '../command-encoder';
import { mapDialogRequest } from '../../views/dialog-mapper';
import type { EventMapper } from '../event-mapper';

const deps = { now: () => 1_000 };

type Frame = Parameters<EventMapper['mapEvent']>[0];

function frame(name: string, payload: Record<string, unknown>, agentName?: string): Frame {
  return { threadId: 't', name, payload, ...(agentName !== undefined ? { agentName } : {}) };
}

/** llm/chunk 帧（turn/step 步坐标 + chunk 判别载荷）。 */
function chunk(turn: number, step: number, type: string, extra: Record<string, unknown> = {}): Frame {
  return frame('llm/chunk', { turn, step, chunk: { type, ...extra } });
}

describe('createEventMapper · 主线程事件', () => {
  test('turn/start → turnStarted（payload.time；缺省回落注入时钟）', () => {
    expect(createEventMapper(deps).mapEvent(frame('turn/start', { time: 1234 }))).toEqual([
      { type: 'turnStarted', threadId: 't', at: 1234 },
    ]);
    expect(createEventMapper(deps).mapEvent(frame('turn/start', {}))).toEqual([
      { type: 'turnStarted', threadId: 't', at: 1000 },
    ]);
  });

  test('首个 text-delta → messageStarted 开缓冲 + 增量同批（messageId 计数生成）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(chunk(0, 0, 'text-delta', { text: '你好' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: '你好' },
    ]);
  });

  test('text/thinking 增量 → textDelta/thinkingDelta（同缓冲同 messageId，逐段透传）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: '你好' }));
    expect(mapper.mapEvent(chunk(0, 0, 'text-delta', { text: '接续' }))).toEqual([
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: '接续' },
    ]);
    expect(mapper.mapEvent(chunk(0, 0, 'thinking-delta', { text: '先想想' }))).toEqual([
      { type: 'thinkingDelta', threadId: 't', messageId: 'stream-1', delta: '先想想' },
    ]);
  });

  test('(turn, step) 步边界重置：同轮两步两 message，跨轮同样重置', () => {
    const mapper = createEventMapper(deps);
    // 第一步：开缓冲
    expect(mapper.mapEvent(chunk(3, 0, 'text-delta', { text: 'a' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: 'a' },
    ]);
    // 同步增量：不重开
    expect(mapper.mapEvent(chunk(3, 0, 'text-delta', { text: 'b' }))).toEqual([
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: 'b' },
    ]);
    // 同轮第二步：边界重置，开新 message
    expect(mapper.mapEvent(chunk(3, 1, 'text-delta', { text: 'c' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-2', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-2', delta: 'c' },
    ]);
    // 跨轮（turn 变化）同样重置
    expect(mapper.mapEvent(chunk(4, 0, 'thinking-delta', { text: 'x' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-3', at: 1000 },
      { type: 'thinkingDelta', threadId: 't', messageId: 'stream-3', delta: 'x' },
    ]);
    // 步终局（WAL assistant/message）：事件自带步坐标——与最新缓冲同坐标则挂其
    // messageId；坐标不一致时以 WAL 为准自开新缓冲（无文本步不复用陈旧缓冲）
    const events = mapper.mapEvent(frame('assistant/message', { turn: 4, step: 0, content: [{ type: 'text', text: 'final' }], thinking: '定形思考' }));
    expect(events).toEqual([
      { type: 'messageFinal', threadId: 't', message: { id: 'stream-3', text: 'final', thinking: '定形思考', toolCalls: [], usage: null } },
    ]);
    // 纯 tool_use 步（无文本）：自开新缓冲出 messageFinal——toolCallAdded 由独立的
    // tool/call WAL 事件产生（消息事件不重复展开工具面）
    const detached = mapper.mapEvent(frame('assistant/message', { turn: 9, step: 0, content: [{ type: 'tool_use', callId: 'c9', name: 'bash', input: '{}' }] }));
    expect(detached).toEqual([
      { type: 'messageFinal', threadId: 't', message: { id: 'stream-4', text: '', thinking: '', toolCalls: [], usage: null } },
    ]);
  });

  test('主会话谓词负例：session 域帧 session≠threadId → 空事件（子会话 WAL 帧不进主时间线）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/message', { session: 'child-9', content: [{ type: 'text', text: '子会话' }] }))).toEqual([]);
    expect(mapper.mapEvent(frame('tool/call', { session: 'child-9', callId: 'c1', name: 'bash', arguments: '{}' }))).toEqual([]);
    expect(mapper.mapEvent(frame('tool/result', { session: 'child-9', callId: 'c1', content: 'x' }))).toEqual([]);
    expect(mapper.mapEvent(frame('turn/start', { session: 'child-9', time: 5 }))).toEqual([]);
    // session 匹配 threadId：照常映射
    expect(mapper.mapEvent(frame('turn/start', { session: 't', time: 5 }))).toEqual([{ type: 'turnStarted', threadId: 't', at: 5 }]);
  });

  test('usage chunk 不产事件（终局 usage 以 WAL assistant/message 载荷为权威）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: 'a' }));
    expect(mapper.mapEvent(chunk(0, 0, 'usage', { usage: { input: 3, output: 4, totalTokens: 7 } }))).toEqual([]);
  });

  test('assistant/message → messageFinal（content 块拼接 + usage 视图 + 流缓冲 id 继承）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(chunk(0, 0, 'thinking-delta', { text: '流式' }));
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: '流式' }));
    expect(
      mapper.mapEvent(
        frame('assistant/message', {
          turn: 0,
          step: 0,
          content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
          thinking: 'P',
          usage: { input: 3, output: 4, total: 7 },
        }),
      ),
    ).toEqual([
      {
        type: 'messageFinal',
        threadId: 't',
        message: { id: 'stream-1', text: 'a\nb', thinking: 'P', toolCalls: [], usage: { input: 3, output: 4 } },
      },
    ]);
  });

  test('assistant/message 缺 usage → messageFinal.usage null；无流缓冲仍定形（id 现场计数）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('assistant/message', { content: [{ type: 'text', text: 'x' }] }))).toEqual([
      { type: 'messageFinal', threadId: 't', message: { id: 'stream-1', text: 'x', thinking: '', toolCalls: [], usage: null } },
    ]);
  });

  test('症状回归：无缓冲先到的 text 增量兜底开缓冲（messageStarted + delta 同批，不丢单词）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(chunk(0, 0, 'text-delta', { text: 'hi' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-1', at: 1000 },
      { type: 'textDelta', threadId: 't', messageId: 'stream-1', delta: 'hi' },
    ]);
    // thinking 同样兜底（settled 清缓冲后再来）
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(chunk(1, 0, 'thinking-delta', { text: 'x' }))).toEqual([
      { type: 'messageStarted', threadId: 't', messageId: 'stream-2', at: 1000 },
      { type: 'thinkingDelta', threadId: 't', messageId: 'stream-2', delta: 'x' },
    ]);
  });

  test('无缓冲时 usage chunk → 空（不凭空开缓冲）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(chunk(0, 0, 'usage', { usage: { input: 1, output: 2 } }))).toEqual([]);
  });

  test('llm/chunk 其余判别（tool-call-delta/finish/词表外）→ 空（显式忽略清单）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: 'a' }));
    expect(mapper.mapEvent(chunk(0, 0, 'tool-call-delta', { callId: 'tc1', name: 'bash', argumentsDelta: '{"comm' }))).toEqual([]);
    expect(mapper.mapEvent(chunk(0, 0, 'finish', { finish: { kind: 'stop' } }))).toEqual([]);
    expect(mapper.mapEvent(chunk(0, 0, 'finish', { finish: { kind: 'error', message: 'm', code: 'E500' } }))).toEqual([]);
    expect(mapper.mapEvent(chunk(0, 0, 'mystery-kind'))).toEqual([]);
  });

  test('tool/call → toolCallAdded（bash 显示命令本体；write 带参数 diff；agent_spawn 带 subagents）', () => {
    const mapper = createEventMapper(deps);
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: 'a' }));

    expect(
      mapper.mapEvent(frame('tool/call', { callId: 'tc1', name: 'bash', arguments: JSON.stringify({ command: 'git status' }) })),
    ).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: 'stream-1', call: { id: 'tc1', name: 'bash', argsPreview: 'git status' }, diff: null },
    ]);

    expect(
      mapper.mapEvent(frame('tool/call', { callId: 'tc2', name: 'write', arguments: JSON.stringify({ path: 'a.ts', content: 'l1\nl2\nl3' }) })),
    ).toEqual([
      {
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'stream-1',
        call: { id: 'tc2', name: 'write', argsPreview: 'a.ts' },
        diff: [{ path: 'a.ts', additions: 3, deletions: 0 }],
      },
    ]);

    expect(
      mapper.mapEvent(frame('tool/call', { callId: 'tc4', name: 'agent_spawn', arguments: JSON.stringify({ description: '扫描现状', prompt: '扫描', subagent_type: 'explore' }) })),
    ).toEqual([
      {
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'stream-1',
        call: { id: 'tc4', name: 'agent_spawn', argsPreview: 'explore', subagents: [{ agent: 'explore', task: '扫描' }] },
        diff: null,
      },
    ]);
  });

  test('tool/call 降级：无流缓冲 messageId 空串；arguments 对象形态与坏 JSON 空参数', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('tool/call', { callId: 'tc0', name: 'bash', arguments: JSON.stringify({ command: 'ls' }) }))).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: '', call: { id: 'tc0', name: 'bash', argsPreview: 'ls' }, diff: null },
    ]);
    // arguments 已是对象（宽容双形态）
    expect(mapper.mapEvent(frame('tool/call', { callId: 'tc5', name: 'read', arguments: { path: 'a.ts' } }))).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: '', call: { id: 'tc5', name: 'read', argsPreview: 'a.ts' }, diff: null },
    ]);
    // 坏 JSON → 空参数（argsPreview 空串）
    expect(mapper.mapEvent(frame('tool/call', { callId: 'tc6', name: 'bash', arguments: '{broken' }))).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: '', call: { id: 'tc6', name: 'bash', argsPreview: '' }, diff: null },
    ]);
  });

  test('agent/tool-stream → toolUpdated（delta 文本）', () => {
    expect(createEventMapper(deps).mapEvent(frame('agent/tool-stream', { callId: 'tc1', delta: 'run…' }))).toEqual([
      { type: 'toolUpdated', threadId: 't', callId: 'tc1', output: 'run…' },
    ]);
  });

  test('tool/result → toolEnded（content 文本拼接、isError；diff 恒 null——结果侧无 patch 面、durationMs 恒 0）', () => {
    expect(
      createEventMapper(deps).mapEvent(
        frame('tool/result', { callId: 'tc9', content: [{ type: 'text', text: 'done' }, { type: 'text', text: 'ok' }], isError: true }),
      ),
    ).toEqual([
      { type: 'toolEnded', threadId: 't', callId: 'tc9', output: 'done\nok', isError: true, durationMs: 0, diff: null },
    ]);

    // content 纯字符串原样；非 text 块不计入 output
    expect(createEventMapper(deps).mapEvent(frame('tool/result', { callId: 'tc1', content: 'plain', isError: false }))).toEqual([
      { type: 'toolEnded', threadId: 't', callId: 'tc1', output: 'plain', isError: false, durationMs: 0, diff: null },
    ]);
    expect(
      createEventMapper(deps).mapEvent(frame('tool/result', { callId: 'tc2', content: [{ type: 'image', data: 'x', mediaType: 'image/png' }] })),
    ).toEqual([{ type: 'toolEnded', threadId: 't', callId: 'tc2', output: '', isError: false, durationMs: 0, diff: null }]);
  });

  test('settled → turnSettled（ok 仅 false 为假、reason 透传、usage 恒 null）并清流缓冲', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('settled', { ok: true, reason: '' }))).toEqual([{ type: 'turnSettled', threadId: 't', ok: true, usage: null }]);
    expect(mapper.mapEvent(frame('settled', { ok: false, reason: 'llm unavailable' }))).toEqual([
      { type: 'turnSettled', threadId: 't', ok: false, reason: 'llm unavailable', usage: null },
    ]);
    // ok 缺省视为成功（worker 合成终态无 ok 字段的防御）
    expect(mapper.mapEvent(frame('settled', {}))).toEqual([{ type: 'turnSettled', threadId: 't', ok: true, usage: null }]);
    // settled 清缓冲：后续孤立 tool/call 不再挂在旧缓冲上（messageId 空串）
    mapper.mapEvent(chunk(0, 0, 'text-delta', { text: 'a' }));
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(frame('tool/call', { callId: 'tc1', name: 'bash', arguments: '{}' }))).toEqual([
      { type: 'toolCallAdded', threadId: 't', messageId: '', call: { id: 'tc1', name: 'bash', argsPreview: '' }, diff: null },
    ]);
  });

  test('compaction/landed → compacting(false) + compacted（replacedNodes → replacedCount 映射；缺省回落 0）', () => {
    expect(createEventMapper(deps).mapEvent(frame('compaction/landed', { replacedNodes: 12 }))).toEqual([
      { type: 'compacting', threadId: 't', active: false },
      { type: 'compacted', threadId: 't', replacedCount: 12 },
    ]);
    const fallback = createEventMapper(deps).mapEvent(frame('compaction/landed', {}));
    expect(fallback).toEqual([
      { type: 'compacting', threadId: 't', active: false },
      { type: 'compacted', threadId: 't', replacedCount: 0 },
    ]);
  });

  test('llm/retry → retrying（retry 序号；failure {message, code?} 拼接文案）', () => {
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { retry: 2, failure: { message: 'rate limited', code: 'E429' } }))).toEqual([
      { type: 'retrying', threadId: 't', attempt: 2, errorMessage: 'rate limited (E429)' },
    ]);
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { retry: 1, failure: { code: 'E500' } }))).toEqual([
      { type: 'retrying', threadId: 't', attempt: 1, errorMessage: 'E500' },
    ]);
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', {}))).toEqual([
      { type: 'retrying', threadId: 't', attempt: 0, errorMessage: '' },
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

  test('agent/spawned → subagentStarted（type→agentName、work→task；work 缺席 task 空串待快照回填）', () => {
    const mapper = createEventMapper(deps);
    expect(
      mapper.mapEvent(frame('agent/spawned', { parent: 't', agentId: 'a1', sessionId: 's1', type: 'explore', depth: 1, work: '扫描现状' })),
    ).toEqual([{ type: 'subagentStarted', threadId: 't', agentId: 'a1', agentName: 'explore', task: '扫描现状' }]);
    expect(mapper.mapEvent(frame('agent/spawned', { parent: 't', agentId: 'a2', sessionId: 's2', type: 'writer', depth: 1 }))).toEqual([
      { type: 'subagentStarted', threadId: 't', agentId: 'a2', agentName: 'writer', task: '' },
    ]);
  });

  test('agent/finished → subagentSettled（outcome 词表原文透传）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agent/finished', { parent: 't', agentId: 'a1', sessionId: 's1', outcome: 'completed', detail: '' }))).toEqual([
      { type: 'subagentSettled', threadId: 't', agentId: 'a1', status: 'completed' },
    ]);
    expect(mapper.mapEvent(frame('agent/finished', { parent: 't', agentId: 'a2', sessionId: 's2', outcome: 'failed', detail: 'boom' }))).toEqual([
      { type: 'subagentSettled', threadId: 't', agentId: 'a2', status: 'failed' },
    ]);
  });

  test('忽略清单：结构信号/审计/前向兼容事件 → 空', () => {
    const mapper = createEventMapper(deps);
    for (const [name, payload] of [
      ['turn/end', { reason: { kind: 'completed' } }],
      ['agent/inbox/spliced', { op: 'insert', target: 'queue', entries: [] }],
      ['permission/decided', { decision: 'allow', toolName: 'bash' }],
      ['user/message', { content: [{ type: 'text', text: 'hi' }] }],
      ['step/start', { index: 0 }],
      ['step/end', { index: 0 }],
      ['system/message', { text: 'sys' }],
      ['assistant/attempt', { attempt: 1 }],
      ['request/start', { id: 'r' }],
      ['session/created', { session: 't' }],
      ['todo/snapshot', { items: [] }],
      ['command/run', { name: 'compact' }],
      ['autocompact/started', {}],
      ['agent/error', { message: 'boom' }],
      ['mystery_event', {}],
    ] as const) {
      expect(mapper.mapEvent(frame(name, payload))).toEqual([]);
    }
  });
});

describe('createEventMapper · 子代理分流（帧级 agentName=agentId）', () => {
  test('agent/assistant-stream chunk text → subagentDelta；thinking 与 start/end 相不透传', () => {
    const mapper = createEventMapper(deps);
    expect(
      mapper.mapEvent(frame('agent/assistant-stream', { session: 'child-s', turn: 0, step: 0, frame: { phase: 'chunk', kind: 'text', text: 'found' } }, 'a1')),
    ).toEqual([{ type: 'subagentDelta', threadId: 't', agentId: 'a1', delta: 'found' }]);
    for (const stream of [
      { phase: 'chunk', kind: 'thinking', text: 'h' },
      { phase: 'start', kind: 'text', text: '' },
      { phase: 'end', kind: 'text', text: '' },
    ]) {
      expect(mapper.mapEvent(frame('agent/assistant-stream', { session: 'child-s', turn: 0, step: 0, frame: stream }, 'a1'))).toEqual([]);
    }
  });

  test('tool/call|agent/tool-stream|tool/result → subagentTool 三相（update 相 name 空串——agent/tool-stream 无名字面；子归属帧不验主会话谓词）', () => {
    const mapper = createEventMapper(deps);
    expect(
      mapper.mapEvent(frame('tool/call', { session: 'child-s', callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'ls' }) }, 'a1')),
    ).toEqual([
      { type: 'subagentTool', threadId: 't', agentId: 'a1', call: { id: 'c1', name: 'bash', argsPreview: 'ls' }, phase: 'start' },
    ]);
    expect(mapper.mapEvent(frame('agent/tool-stream', { callId: 'c1', delta: 'o' }, 'a1'))).toEqual([
      { type: 'subagentTool', threadId: 't', agentId: 'a1', call: { id: 'c1', name: '', argsPreview: '' }, phase: 'update', output: 'o' },
    ]);
    expect(
      mapper.mapEvent(frame('tool/result', { session: 'child-s', callId: 'c1', name: 'bash', content: [{ type: 'text', text: 'done' }], isError: true }, 'a1')),
    ).toEqual([
      { type: 'subagentTool', threadId: 't', agentId: 'a1', call: { id: 'c1', name: 'bash', argsPreview: '' }, phase: 'end', output: 'done', isError: true },
    ]);
  });

  test('agent/status → subagentState（running 为真、idle 为假）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agent/status', { status: 'running' }, 'a1'))).toEqual([
      { type: 'subagentState', threadId: 't', agentId: 'a1', busy: true },
    ]);
    expect(mapper.mapEvent(frame('agent/status', { status: 'idle' }, 'a1'))).toEqual([
      { type: 'subagentState', threadId: 't', agentId: 'a1', busy: false },
    ]);
  });

  test('子代理域其余事件（settled、turn/*、bash_execution_update、agent/spawned）→ 空', () => {
    const mapper = createEventMapper(deps);
    for (const [name, payload] of [
      ['settled', { ok: true }],
      ['turn/start', { time: 1 }],
      ['bash_execution_update', { delta: 'x' }],
      ['agent/spawned', { agentId: 'a2', type: 'explore', work: 'w' }],
      ['mystery', {}],
    ] as const) {
      expect(mapper.mapEvent(frame(name, payload, 'a1'))).toEqual([]);
    }
  });

  test('agentName 空串视为主线程（无中继身份语义）', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('llm/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', text: 'hi' } }, ''))).toEqual([
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

describe('agent/tool-stream 增量累积（桥发 delta 批非快照）', () => {
  test('同 callId 多批累积为快照；tool/result 冲净；settled 清记忆表', () => {
    const mapper = createEventMapper(deps);
    expect(mapper.mapEvent(frame('agent/tool-stream', { callId: 'c1', delta: 'part1-' }))).toEqual([
      { type: 'toolUpdated', threadId: 't', callId: 'c1', output: 'part1-' },
    ]);
    expect(mapper.mapEvent(frame('agent/tool-stream', { callId: 'c1', delta: 'part2' }))).toEqual([
      { type: 'toolUpdated', threadId: 't', callId: 'c1', output: 'part1-part2' },
    ]);
    // 结算后新轮同 callId 不残留旧累积
    mapper.mapEvent(frame('tool/result', { callId: 'c1', content: 'done' }));
    expect(mapper.mapEvent(frame('agent/tool-stream', { callId: 'c1', delta: 'fresh' }))).toEqual([
      { type: 'toolUpdated', threadId: 't', callId: 'c1', output: 'fresh' },
    ]);
  });
});

