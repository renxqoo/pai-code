import { describe, expect, test } from 'bun:test';

import { mapEntries } from '../entries-mapper';
import { diffFromPatch, isFileMutatingTool } from '../diff-extract';

/** WAL 事件行 {seq, ts, event}（get_entries 响应 entries 元素的形状）。 */
function row(seq: number, ts: number, event: Record<string, unknown>): Record<string, unknown> {
  return { seq, ts, event };
}

describe('mapEntries（WAL 转写真相源）', () => {
  test('user 消息：text 块扁平化、image 块 mediaType 提取、origin 收窄', () => {
    const { items, cursor } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: '看图' }, { type: 'image', data: 'aGk=', mediaType: 'image/png' }],
          origin: 'user',
        }),
        row(2, 200, { type: 'message', role: 'user', content: [{ type: 'text', text: '[task]普通消息' }], origin: 'steering' }),
        row(3, 300, { type: 'message', role: 'user', content: [{ type: 'text', text: '子代理完成' }], origin: 'notification' }),
        row(4, 400, { type: 'message', role: 'user', content: [{ type: 'text', text: '系统注入' }], origin: 'system' }),
        row(5, 500, { type: 'message', role: 'user', content: [{ type: 'text', text: '缺 origin' }] }),
      ],
    });
    expect(items).toEqual([
      { kind: 'user', id: 'seq-1', text: '看图', origin: 'user', images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }], at: 100 },
      { kind: 'user', id: 'seq-2', text: '[task]普通消息', origin: 'user', images: [], at: 200 },
      { kind: 'user', id: 'seq-3', text: '子代理完成', origin: 'system', images: [], at: 300 },
      { kind: 'user', id: 'seq-4', text: '系统注入', origin: 'system', images: [], at: 400 },
      { kind: 'user', id: 'seq-5', text: '缺 origin', origin: 'user', images: [], at: 500 },
    ]);
    expect(cursor).toBe(5);
  });

  test('垃圾图片块丢弃（data/mediaType 空缺），文本不受影响', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, {
          type: 'message',
          role: 'user',
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

  test('assistant 消息：text/thinking/tool_use 块分离 + usage 视图 {input,output}', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'thinking', text: '先跑' },
            { type: 'text', text: '跑起来了' },
            { type: 'tool_use', id: 'tc1', name: 'bash', input: { command: 'bun test' } },
          ],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
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

  test('assistant 异常终态收窄：error 带 meta.error、aborted/length 透传不带文案、正常 stop/tool_use 归 null', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'message', role: 'assistant', content: [], stopReason: 'error', meta: { error: '401 {"type":"error"}' } }),
        row(2, 2, { type: 'message', role: 'assistant', content: [], stopReason: 'aborted', meta: { error: 'interrupted' } }),
        row(3, 3, { type: 'message', role: 'assistant', content: [{ type: 'text', text: '正常' }], stopReason: 'tool_use' }),
        row(4, 4, { type: 'message', role: 'assistant', content: [{ type: 'text', text: '截断' }], stopReason: 'length' }),
        row(5, 5, { type: 'message', role: 'assistant', content: [], stopReason: 'error' }),
      ],
    });
    const assistants = items.map((item) => (item.kind === 'assistant' ? { stopReason: item.stopReason, errorMessage: item.errorMessage } : null));
    expect(assistants).toEqual([
      { stopReason: 'error', errorMessage: '401 {"type":"error"}' },
      { stopReason: 'aborted', errorMessage: null },
      { stopReason: null, errorMessage: null },
      { stopReason: 'length', errorMessage: null },
      { stopReason: 'error', errorMessage: null },
    ]);
  });

  test('tool_result 事件按 toolUseId 并入前一条 assistant 的 toolCalls（原位更新）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'message', role: 'user', content: [{ type: 'text', text: '跑测试' }] }),
        row(2, 2, {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tc1', name: 'bash', input: { command: 'bun test' } },
            { type: 'tool_use', id: 'tc2', name: 'read', input: { path: 'a.ts' } },
          ],
        }),
        row(3, 3, { type: 'tool_result', toolUseId: 'tc1', toolName: 'bash', content: [{ type: 'text', text: '3 pass' }], isError: false }),
        row(4, 4, { type: 'tool_result', toolUseId: 'tc2', toolName: 'read', content: [{ type: 'text', text: 'oops' }], isError: true }),
      ],
    });
    const assistant = items[1];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant item');
    expect(assistant.toolCalls).toEqual([
      { id: 'tc1', name: 'bash', argsPreview: 'bun test', output: '3 pass', isError: false, diff: null },
      { id: 'tc2', name: 'read', argsPreview: 'a.ts', output: 'oops', isError: true, diff: null },
    ]);
  });

  test('write/edit 的参数 diff 与 agent 的 subagents 在 tool_result 并入后保留', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'edit_file', input: { path: 'src/a.ts', edits: [{ oldText: 'x\ny', newText: 'z' }] } },
            { type: 'tool_use', id: 't2', name: 'write_file', input: { path: 'new.ts', content: 'a\nb' } },
            { type: 'tool_use', id: 't3', name: 'agent', input: { prompt: '扫描 A', subagent_type: 'explore' } },
          ],
        }),
        row(2, 2, { type: 'tool_result', toolUseId: 't1', toolName: 'edit_file', content: [{ type: 'text', text: 'done' }], isError: false }),
        row(3, 3, { type: 'tool_result', toolUseId: 't2', toolName: 'write_file', content: [], isError: false }),
        row(4, 4, { type: 'tool_result', toolUseId: 't3', toolName: 'agent', content: [{ type: 'text', text: 'ok' }], isError: false }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([
      // edit/write 的 diff 来自参数（执行前已知），tool_result 无 diff 不得清掉
      { id: 't1', name: 'edit_file', argsPreview: 'src/a.ts', output: 'done', isError: false, diff: [{ path: 'src/a.ts', additions: 1, deletions: 2 }] },
      { id: 't2', name: 'write_file', argsPreview: 'new.ts', output: '', isError: false, diff: [{ path: 'new.ts', additions: 2, deletions: 0 }] },
      { id: 't3', name: 'agent', argsPreview: 'explore', output: 'ok', isError: false, diff: null, subagents: [{ agent: 'explore', task: '扫描 A' }] },
    ]);
  });

  test('tool_use 块缺 name 时以 tool_result 的 toolName 回填（diff 按块名判定，回填不追溯重建）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: '', input: { path: 'src/a.ts', edits: [{ oldText: 'x', newText: 'z' }] } }],
        }),
        row(2, 2, { type: 'tool_result', toolUseId: 't1', toolName: 'edit_file', content: [{ type: 'text', text: 'done' }], isError: false }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([{ id: 't1', name: 'edit_file', argsPreview: 'src/a.ts', output: 'done', isError: false, diff: null }]);
  });

  test('孤儿 tool_result（找不到所属 assistant）丢弃不抛；user 消息后旧 tool_use 不可再并入', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 1, { type: 'tool_result', toolUseId: 'ghost', toolName: 'bash', content: [], isError: true }),
        row(2, 2, { type: 'message', role: 'assistant', content: [{ type: 'tool_use', id: 'tc1', name: 'bash', input: { command: 'ls' } }] }),
        row(3, 3, { type: 'message', role: 'user', content: [{ type: 'text', text: '插话' }] }),
        row(4, 4, { type: 'tool_result', toolUseId: 'tc1', toolName: 'bash', content: [{ type: 'text', text: 'late' }], isError: false }),
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
        row(1, 1, { type: 'message', role: 'user', content: [{ type: 'text', text: '[bash] $ git status\nclean\nnothing to commit' }], origin: 'user' }),
        row(2, 2, { type: 'message', role: 'user', content: [{ type: 'text', text: '[bash] $ echo hi' }] }),
        row(3, 3, { type: 'message', role: 'user', content: [{ type: 'text', text: '[bash] $' }] }),
      ],
    });
    expect(items).toEqual([
      { kind: 'bash', id: 'seq-1', command: 'git status', output: 'clean\nnothing to commit', exitCode: 0, cancelled: false, at: 1 },
      { kind: 'bash', id: 'seq-2', command: 'echo hi', output: '', exitCode: 0, cancelled: false, at: 2 },
      // 前缀不完整（缺尾随空格）不算信封，落普通 user 条目
      { kind: 'user', id: 'seq-3', text: '[bash] $', origin: 'user', images: [], at: 3 },
    ]);
  });

  test('元数据事件不产条目但 cursor 推进（按行消费不按渲染条目消费）', () => {
    const { items, cursor } = mapEntries({
      entries: [
        row(1, 1, { type: 'session_init', sessionId: 's1', depth: 0, createdAt: 1, cwd: '/p' }),
        row(2, 2, { type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] }),
        row(3, 3, { type: 'session_meta', key: 'title', value: 'n' }),
        row(4, 4, { type: 'compaction', replacedCount: 5 }),
        row(5, 5, { type: 'inbox_spliced', spliced: 1 }),
        row(6, 6, { type: 'llm_retry', attempt: 1 }),
        row(7, 7, { type: 'permission_decision', decision: 'allow' }),
        row(8, 8, { type: 'turn_start', turnId: 1 }),
        row(9, 9, { type: 'tool_result_redacted', toolUseId: 'x' }),
        row(10, 10, { type: 'custom', id: 'e1' }),
        row(11, 11, { type: 'message', role: 'mystery', content: [] }),
      ],
    });
    expect(items).toEqual([{ kind: 'user', id: 'seq-2', text: 'hi', origin: 'user', images: [], at: 2 }]);
    expect(cursor).toBe(11);
  });

  test('cursor = 最后有效 seq 行（数字）；无 seq 的行整行跳过不推进', () => {
    const { items, cursor } = mapEntries({
      entries: [row(3, 3, { type: 'session_meta', key: 'k' }), null, 42, { ts: 9, event: { type: 'message' } }, row(7, 7, { type: 'session_meta', key: 'k' })],
    });
    expect(items).toEqual([]);
    expect(cursor).toBe(7);
  });

  test('行 ts 缺省回落 0（messageTs/at 不因此丢行）', () => {
    const { items } = mapEntries({ entries: [{ seq: 1, event: { type: 'message', role: 'user', content: 'hi' } }] });
    expect(items).toEqual([{ kind: 'user', id: 'seq-1', text: 'hi', origin: 'user', images: [], at: 0 }]);
  });

  test('垃圾输入降级：非对象/非数组/空 → 空形态', () => {
    expect(mapEntries(undefined)).toEqual({ items: [], cursor: null });
    expect(mapEntries(null)).toEqual({ items: [], cursor: null });
    expect(mapEntries({})).toEqual({ items: [], cursor: null });
    expect(mapEntries({ entries: 'nope' })).toEqual({ items: [], cursor: null });
    expect(mapEntries([row(1, 1, { type: 'message', role: 'user', content: 'hi' })])).toEqual({ items: [], cursor: null });
    expect(mapEntries({ entries: [] })).toEqual({ items: [], cursor: null });
  });
});

describe('diffFromPatch', () => {
  test('统一 diff：+++ 头取路径、+/- 计数、a|b 前缀剥除', () => {
    const patch = '--- a/p/q.ts\n+++ b/p/q.ts\n@@ -1,3 +1,4 @@\n ctx\n-rem\n+add\n+add2\n ctx2';
    expect(diffFromPatch(patch)).toEqual({ path: 'p/q.ts', additions: 2, deletions: 1 });
  });

  test('文件头带时间戳列（tab 分隔）：取 tab 前路径；--- 兜底头也可定路径', () => {
    const patch = '--- p/q.ts\t2026-01-01\n+++ p/q.ts\t2026-01-02\n@@ -1 +1 @@\n-a\n+b';
    expect(diffFromPatch(patch)).toEqual({ path: 'p/q.ts', additions: 1, deletions: 1 });
    const fallback = '--- only/old.ts\n+++ /dev/null\n@@ -1 +0 @@\n-gone';
    expect(diffFromPatch(fallback)).toEqual({ path: 'only/old.ts', additions: 0, deletions: 1 });
  });

  test.each([
    ['非字符串', 42],
    ['空串', ''],
    ['无文件头', '@@ -1 +1 @@\n+x'],
  ])('垃圾：%s → null', (_name, patch) => {
    expect(diffFromPatch(patch)).toBeNull();
  });
});

describe('isFileMutatingTool · 内核文件工具词表', () => {
  test.each([
    ['edit_file', true],
    ['write_file', true],
    ['bash', false],
    ['agent', false],
    ['', false],
  ])('%s → %s', (name, expected) => {
    expect(isFileMutatingTool(name)).toBe(expected);
  });
});
