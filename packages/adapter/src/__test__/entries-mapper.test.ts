import { describe, expect, test } from 'bun:test';

import { mapEntries } from '../entries-mapper';
import { isFileMutatingTool } from '../diff-extract';

/** WAL 投影行 {seq, ts, event}（get_entries 响应 entries 元素的形状——event 摊平 {type, …data}）。 */
function row(seq: number, ts: number, event: Record<string, unknown>): Record<string, unknown> {
  return { seq, ts, event };
}

describe('mapEntries（x-harness WAL 转写真相源）', () => {
  test('user/message：text 块扁平化、image 块 mediaType 提取', () => {
    const { items, cursor } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'user/message',
          turn: 0,
          step: 0,
          content: [{ type: 'text', text: '看图' }, { type: 'image', data: 'aGk=', mediaType: 'image/png' }],
        }),
        row(2, 200, { type: 'user/message', turn: 1, step: 0, content: [{ type: 'text', text: '普通消息' }] }),
      ],
    });
    expect(items).toEqual([
      { kind: 'user', id: 'seq-1', text: '看图', origin: 'user', images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }], at: 100 },
      { kind: 'user', id: 'seq-2', text: '普通消息', origin: 'user', images: [], at: 200 },
    ]);
    expect(cursor).toBe(2);
  });

  test('症状回归「首条消息前泄漏快照信封」：内核尾部快照帧整帧跳过（cursor 仍推进），首条用户消息成为第一个条目', () => {
    const envelope = [
      '<snapshot kind="agent-types">',
      'This snapshot supersedes earlier snapshots of this kind.',
      '<system-reminder>',
      'Available agent types:',
      '- claude — 兜底通用代理。',
      '</system-reminder>',
      '</snapshot>',
    ].join('\n');
    const { items, cursor } = mapEntries({
      entries: [
        row(1, 100, { type: 'user/message', turn: 0, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: envelope }] }),
        row(2, 200, { type: 'user/message', turn: 1, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: '你好' }] }),
      ],
    });
    expect(items).toEqual([
      { kind: 'user', id: 'seq-2', text: '你好', origin: 'user', images: [], at: 200 },
    ]);
    expect(cursor).toBe(2);
  });

  test('快照过滤 kind 无关（date/尾部重注入副本同跳过）；信封形但次行无作废声明的用户消息不误吞', () => {
    const dateEnvelope = [
      '<snapshot kind="date">',
      'This snapshot supersedes earlier snapshots of this kind.',
      "Today's date: 2026-09-21 (UTC+8)",
      '</snapshot>',
    ].join('\n');
    const fakeEnvelope = ['<snapshot kind="agent-types">', '看起来像信封的用户消息', '</snapshot>'].join('\n');
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'user/message', turn: 0, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: dateEnvelope }] }),
        row(2, 2, { type: 'user/message', turn: 1, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: '你好' }] }),
        row(3, 3, { type: 'user/message', turn: 2, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: dateEnvelope }] }),
        row(4, 4, { type: 'user/message', turn: 3, step: 0, surfaceOp: 'append', content: [{ type: 'text', text: fakeEnvelope }] }),
      ],
    });
    expect(items.map((item) => item.id)).toEqual(['seq-2', 'seq-4']);
    expect(items[1]?.kind === 'user' && items[1]['text']).toBe(fakeEnvelope);
  });

  test('垃圾图片块丢弃（data/mediaType 空缺），文本不受影响', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, {
          type: 'user/message',
          turn: 0,
          step: 0,
          content: [
            { type: 'text', text: '图片有什么' },
            { type: 'image', data: 'aGk=', mediaType: 'image/png' },
            { type: 'image', data: '', mediaType: 'image/png' },
            { type: 'image', data: 'aGk=' },
            { type: 'image', mediaType: 'image/png' },
          ],
        }),
      ],
    });
    expect(items).toEqual([
      { kind: 'user', id: 'seq-1', text: '图片有什么', origin: 'user', images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }], at: 1 },
    ]);
  });

  test('assistant/message：text/thinking/tool_use 块分离 + usage 视图 {input,output}（input 为 JSON 串）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'assistant/message',
          turn: 0,
          step: 0,
          content: [
            { type: 'thinking', text: '先跑' },
            { type: 'text', text: '跑起来了' },
            { type: 'tool_use', callId: 'tc1', name: 'bash', input: '{"command":"bun test"}' },
          ],
          usage: { input: 10, output: 5, totalTokens: 15 },
        }),
      ],
    });
    expect(items).toEqual([
      {
        kind: 'assistant',
        id: 'seq-1',
        at: 100,
        messageTs: 100,
        text: '跑起来了',
        thinking: '先跑',
        toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'bun test', output: '', isError: false, diff: null }],
        usage: { input: 10, output: 5 },
        stopReason: null,
        errorMessage: null,
      },
    ]);
  });

  test('assistant/message thinking 独立字段优先于 content 块', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'assistant/message', turn: 0, step: 0, content: [{ type: 'text', text: '答' }], thinking: '独立思考' }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.thinking).toBe('独立思考');
  });

  test('assistant 异常终态收窄（内核词表 stop|max-tokens + interrupted 布尔）：interrupted→aborted、max-tokens 透传、正常归 null', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'assistant/message', turn: 0, step: 0, content: [], stopReason: 'stop', interrupted: true }),
        row(2, 2, { type: 'assistant/message', turn: 1, step: 0, content: [{ type: 'text', text: '正常' }], stopReason: 'stop' }),
        row(3, 3, { type: 'assistant/message', turn: 2, step: 0, content: [{ type: 'text', text: '截断' }], stopReason: 'max-tokens' }),
        row(4, 4, { type: 'assistant/message', turn: 3, step: 0, content: [], stopReason: 'stop', interrupted: true }),
        row(5, 5, { type: 'assistant/message', turn: 4, step: 0, content: [] }),
      ],
    });
    const assistants = items.map((item) => (item.kind === 'assistant' ? { stopReason: item.stopReason, errorMessage: item.errorMessage } : null));
    expect(assistants).toEqual([
      { stopReason: 'aborted', errorMessage: null },
      { stopReason: null, errorMessage: null },
      { stopReason: 'max-tokens', errorMessage: null },
      { stopReason: 'aborted', errorMessage: null },
      { stopReason: null, errorMessage: null },
    ]);
  });

  test('tool/result 事件按 callId 并入前一条 assistant 的 toolCalls（原位更新，content 为纯文本）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: '跑测试' }] }),
        row(2, 2, {
          type: 'assistant/message',
          turn: 0,
          step: 0,
          content: [
            { type: 'tool_use', callId: 'tc1', name: 'bash', input: '{"command":"bun test"}' },
            { type: 'tool_use', callId: 'tc2', name: 'read', input: '{"path":"a.ts"}' },
          ],
        }),
        row(3, 3, { type: 'tool/result', turn: 0, step: 0, callId: 'tc1', content: '3 pass', isError: undefined }),
        row(4, 4, { type: 'tool/result', turn: 0, step: 0, callId: 'tc2', content: 'oops', isError: true }),
      ],
    });
    const assistant = items[1];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant item');
    expect(assistant.toolCalls).toEqual([
      { id: 'tc1', name: 'bash', argsPreview: 'bun test', output: '3 pass', isError: false, diff: null },
      { id: 'tc2', name: 'read', argsPreview: 'a.ts', output: 'oops', isError: true, diff: null },
    ]);
  });

  test('tool/call 先于 assistant/message 到达：参数暂存后在 message 落位（write diff 与 agent_spawn subagents 保留）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'tool/call', turn: 0, step: 0, callId: 't2', name: 'write', arguments: '{"path":"new.ts","content":"a\\nb"}' }),
        row(2, 2, { type: 'tool/call', turn: 0, step: 0, callId: 't3', name: 'agent_spawn', arguments: '{"description":"扫描","prompt":"扫描 A","subagent_type":"explore"}' }),
        row(3, 3, {
          type: 'assistant/message',
          turn: 0,
          step: 0,
          content: [
            { type: 'tool_use', callId: 't1', name: 'bash', input: '{"command":"ls"}' },
            { type: 'tool_use', callId: 't2', name: 'write', input: '' },
            { type: 'tool_use', callId: 't3', name: 'agent_spawn', input: '' },
          ],
        }),
        row(4, 4, { type: 'tool/result', turn: 0, step: 0, callId: 't2', content: 'done' }),
        row(5, 5, { type: 'tool/result', turn: 0, step: 0, callId: 't3', content: 'ok' }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([
      { id: 't1', name: 'bash', argsPreview: 'ls', output: '', isError: false, diff: null },
      { id: 't2', name: 'write', argsPreview: 'new.ts', output: 'done', isError: false, diff: [{ path: 'new.ts', additions: 2, deletions: 0 }] },
      { id: 't3', name: 'agent_spawn', argsPreview: 'explore', output: 'ok', isError: false, diff: null, subagents: [{ agent: 'explore', task: '扫描 A' }] },
    ]);
  });

  test('tool/call 后于 assistant/message 到达：原位补齐 name/args（write diff 按 tool/call 参数判定）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'assistant/message', turn: 0, step: 0, content: [{ type: 'tool_use', callId: 't1', name: 'write', input: '' }] }),
        row(2, 2, { type: 'tool/call', turn: 0, step: 0, callId: 't1', name: 'write', arguments: '{"path":"src/a.ts","content":"x\\ny\\nz"}' }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([
      { id: 't1', name: 'write', argsPreview: 'src/a.ts', output: '', isError: false, diff: [{ path: 'src/a.ts', additions: 3, deletions: 0 }] },
    ]);
  });

  test('孤儿 tool/result（找不到所属 assistant）丢弃不抛；user/message 后旧 tool_use 不可再并入', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'tool/result', turn: 0, step: 0, callId: 'ghost', content: '', isError: true }),
        row(2, 2, { type: 'assistant/message', turn: 0, step: 0, content: [{ type: 'tool_use', callId: 'tc1', name: 'bash', input: '{"command":"ls"}' }] }),
        row(3, 3, { type: 'user/message', turn: 1, step: 0, content: [{ type: 'text', text: '插话' }] }),
        row(4, 4, { type: 'tool/result', turn: 0, step: 0, callId: 'tc1', content: 'late' }),
      ],
    });
    expect(items).toHaveLength(2);
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([{ id: 'tc1', name: 'bash', argsPreview: 'ls', output: '', isError: false, diff: null }]);
  });

  test('bash 信封还原：首行 `[bash] $ <cmd>`、其余为输出', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: '[bash] $ git status\nclean\nnothing to commit' }] }),
        row(2, 2, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: '[bash] $ echo hi' }] }),
        row(3, 3, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: '[bash] $' }] }),
      ],
    });
    expect(items).toEqual([
      { kind: 'bash', id: 'seq-1', command: 'git status', output: 'clean\nnothing to commit', exitCode: 0, cancelled: false, at: 1 },
      { kind: 'bash', id: 'seq-2', command: 'echo hi', output: '', exitCode: 0, cancelled: false, at: 2 },
      // 前缀不完整（缺尾随空格）不算信封，落普通 user 条目
      { kind: 'user', id: 'seq-3', text: '[bash] $', origin: 'user', images: [], at: 3 },
    ]);
  });

  test('元数据/账本事件不产条目但 cursor 推进（按行消费不按渲染条目消费）', () => {
    const { items, cursor } = mapEntries({
      entries: [
        row(1, 1, { type: 'turn/start', turn: 0 }),
        row(2, 2, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: 'hi' }] }),
        row(3, 3, { type: 'session/meta', key: 'title', value: 'n' }),
        row(4, 4, { type: 'compaction/landed', trigger: 'manual', replacedNodes: 5, summaryTokens: 100 }),
        row(5, 5, { type: 'agent/inbox/spliced', op: 'insert', target: 'next-turn', entries: [] }),
        row(6, 6, { type: 'llm/retry', turn: 0, step: 0, retry: 1, delayMs: 500, failure: { message: 'x' } }),
        row(7, 7, { type: 'permission/decided', tool: 'bash', verdict: 'allow', resolvedBy: 'rule', reason: 'r' }),
        row(8, 8, { type: 'step/start', turn: 0, step: 1 }),
        row(9, 9, { type: 'todo/snapshot', seq: 9, tasks: [], edges: [] }),
        row(10, 10, { type: 'command/run', commandId: 'cmd-1', name: 'compact' }),
        row(11, 11, { type: 'system/message', turn: 0, step: 0, text: 'sys' }),
        row(12, 12, { type: 'assistant/attempt', turn: 0, step: 0, error: { message: 'm' } }),
        row(13, 13, { type: 'request/header', model: 'm', tools: [] }),
        row(14, 14, { type: 'unknown-future-event', whatever: 1 }),
      ],
    });
    expect(items).toEqual([{ kind: 'user', id: 'seq-2', text: 'hi', origin: 'user', images: [], at: 2 }]);
    expect(cursor).toBe(14);
  });

  test('cursor = 最后有效 seq 行（数字）；无 seq 的行整行跳过不推进', () => {
    const { items, cursor } = mapEntries({
      entries: [row(3, 3, { type: 'session/meta', key: 'k' }), null, 42, { ts: 9, event: { type: 'user/message' } }, row(7, 7, { type: 'session/meta', key: 'k' })],
    });
    expect(items).toEqual([]);
    expect(cursor).toBe(7);
  });

  test('行 ts 缺省回落 0（messageTs/at 不因此丢行）', () => {
    const { items } = mapEntries({ entries: [{ seq: 1, event: { type: 'user/message', turn: 0, step: 0, content: 'hi' } }] });
    expect(items).toEqual([{ kind: 'user', id: 'seq-1', text: 'hi', origin: 'user', images: [], at: 0 }]);
  });

  test('垃圾输入降级：非对象/非数组/空 → 空形态', () => {
    expect(mapEntries(undefined)).toEqual({ items: [], cursor: null });
    expect(mapEntries(null)).toEqual({ items: [], cursor: null });
    expect(mapEntries({})).toEqual({ items: [], cursor: null });
    expect(mapEntries({ entries: 'nope' })).toEqual({ items: [], cursor: null });
    expect(mapEntries([row(1, 1, { type: 'user/message', turn: 0, step: 0, content: 'hi' })])).toEqual({ items: [], cursor: null });
    expect(mapEntries({ entries: [] })).toEqual({ items: [], cursor: null });
  });
});

describe('isFileMutatingTool · 内核文件工具词表（x-harness：仅 write）', () => {
  test.each([
    ['write', true],
    ['bash', false],
    ['agent_spawn', false],
    ['', false],
  ])('%s → %s', (name, expected) => {
    expect(isFileMutatingTool(name)).toBe(expected);
  });
});

describe('surfaceOp replace（压缩区间折叠——docs/COMPACTION.md §2.A）', () => {
  test('带 replace 的摘要条目剔除区间内旧条目再追加；append 直通', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: '问题一' }] }),
        row(2, 2, { type: 'assistant/message', turn: 0, step: 0, content: [{ type: 'text', text: '长回答' }] }),
        row(3, 3, { type: 'user/message', turn: 1, step: 0, content: [{ type: 'text', text: '问题二' }] }),
        row(4, 4, { type: 'assistant/message', turn: 1, step: 0, content: [{ type: 'text', text: '另一答' }] }),
        // 压缩摘要：替换 seq 1..3（保留「另一答」）
        row(5, 5, {
          type: 'user/message',
          turn: 2,
          step: 0,
          content: [{ type: 'text', text: '[summary] 前情摘要' }],
          surfaceOp: { op: 'replace', startSeq: 1, endSeq: 3 },
        }),
        row(6, 6, { type: 'user/message', turn: 3, step: 0, content: [{ type: 'text', text: '新消息' }], surfaceOp: 'append' }),
      ],
    });
    expect(items.map((item) => (item.kind === 'user' || item.kind === 'assistant' ? item.text : ''))).toEqual([
      '另一答',
      '[summary] 前情摘要',
      '新消息',
    ]);
  });

  test('turn/end reason 判别穷举（六 kind 均不产渲染条目——cursor 推进）', () => {
    const reasons = [
      { kind: 'completed' },
      { kind: 'aborted', cause: 'client-abort' },
      { kind: 'blocked', reason: 'permission' },
      { kind: 'error', message: 'boom' },
      { kind: 'max-tokens' },
      { kind: 'interrupted' },
    ];
    const entries = reasons.flatMap((reason, index) => [
      row(index * 2 + 1, index * 2 + 1, { type: 'user/message', turn: index, step: 0, content: [{ type: 'text', text: `q${index}` }] }),
      row(index * 2 + 2, index * 2 + 2, { type: 'turn/end', turn: index, reason }),
    ]);
    const { items, cursor } = mapEntries({ entries });
    expect(items.map((item) => (item.kind === 'user' ? item.text : ''))).toEqual(['q0', 'q1', 'q2', 'q3', 'q4', 'q5']);
    expect(cursor).toBe(12);
  });
});

