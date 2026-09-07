import { describe, expect, test } from 'bun:test';

import { mapEntries } from '../entries-mapper';
import { diffFromPatch } from '../diff-extract';
import { sessionFromStartResponse, sessionStatsView, savedSessions, modelInfos, threadListEntries, threadStateView, thinkingLevels } from '../response-views';

function messageEntry(id: string, message: Record<string, unknown>): Record<string, unknown> {
  return { type: 'message', id, parentId: null, timestamp: '2026-01-01T00:00:00Z', message };
}

describe('mapEntries（转写真相源）', () => {
  test('user 双形态扁平化：string 与 [{type:text}] 数组', () => {
    const { items, cursor } = mapEntries([
      messageEntry('e1', { role: 'user', content: 'hello', timestamp: 1 }),
      messageEntry('e2', { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x', mimeType: 'image/png' }, { type: 'text', text: 'b' }], timestamp: 2 }),
    ]);
    expect(items).toEqual([
      { kind: 'user', id: 'e1', text: 'hello', origin: 'user' },
      { kind: 'user', id: 'e2', text: 'a\nb', origin: 'user' },
    ]);
    expect(cursor).toBe('e2');
  });

  test('task-notification / task-message 信封 → origin system', () => {
    const { items } = mapEntries([
      messageEntry('e1', { role: 'user', content: '[task-notification] subagent s1 completed.', timestamp: 1 }),
      messageEntry('e2', { role: 'user', content: '[task-message] from subagent s2: hi', timestamp: 2 }),
      messageEntry('e3', { role: 'user', content: '[task]普通消息', timestamp: 3 }),
    ]);
    expect(items.map((i) => (i.kind === 'user' ? i.origin : 'x'))).toEqual(['system', 'system', 'user']);
  });

  test('assistant 正文/thinking 分离 + toolResult 并入所属 assistant 条目', () => {
    const { items } = mapEntries([
      messageEntry('e1', { role: 'user', content: '跑测试', timestamp: 1 }),
      messageEntry('e2', {
        role: 'assistant',
        timestamp: 2,
        content: [
          { type: 'thinking', thinking: '先跑' },
          { type: 'text', text: '跑起来了' },
          { type: 'toolCall', id: 'tc1', name: 'bash', arguments: { command: 'bun test' } },
        ],
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
      }),
      messageEntry('e3', { role: 'toolResult', toolCallId: 'tc1', toolName: 'bash', content: [{ type: 'text', text: '3 pass' }], isError: false, timestamp: 3 }),
      messageEntry('e4', { role: 'assistant', timestamp: 4, content: [{ type: 'text', text: '全绿' }], usage: { input: 30, output: 2, total: 32 } }),
    ]);
    expect(items).toEqual([
      { kind: 'user', id: 'e1', text: '跑测试', origin: 'user' },
      {
        kind: 'assistant',
        id: 'e2',
        text: '跑起来了',
        thinking: '先跑',
        toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'bun test', output: '3 pass', isError: false, diff: null }],
        usage: { input: 10, output: 5 },
      },
      { kind: 'assistant', id: 'e4', text: '全绿', thinking: '', toolCalls: [], usage: { input: 30, output: 2 } },
    ]);
  });

  test('toolResult 找不到所属 assistant（异常序）→ 丢弃不抛', () => {
    const { items } = mapEntries([messageEntry('e1', { role: 'toolResult', toolCallId: 'ghost', toolName: 'bash', content: [], isError: true, timestamp: 1 })]);
    expect(items).toEqual([]);
  });

  test('edit 结果 diff 并入（patch 解析）；write 从参数提取', () => {
    const patch = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-x\n+y\n+z';
    const { items } = mapEntries([
      messageEntry('e1', {
        role: 'assistant',
        timestamp: 1,
        content: [
          { type: 'toolCall', id: 't1', name: 'edit', arguments: { path: 'src/a.ts', edits: [] } },
          { type: 'toolCall', id: 't2', name: 'write', arguments: { path: 'new.ts', content: 'a\nb' } },
        ],
      }),
      messageEntry('e2', { role: 'toolResult', toolCallId: 't1', toolName: 'edit', content: [], isError: false, details: { diff: 'd', patch } }),
      messageEntry('e3', { role: 'toolResult', toolCallId: 't2', toolName: 'write', content: [], isError: false, details: undefined }),
    ]);
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls[0]?.diff).toEqual([{ path: 'src/a.ts', additions: 2, deletions: 1 }]);
    expect(assistant.toolCalls[1]?.diff).toEqual([{ path: 'new.ts', additions: 2, deletions: 0 }]);
  });

  test('bashExecution 条目 → bash HistoryItem', () => {
    const { items } = mapEntries([
      messageEntry('e1', { role: 'bashExecution', command: 'git status', output: 'clean', exitCode: 0, cancelled: false, timestamp: 1 }),
    ]);
    expect(items).toEqual([{ kind: 'bash', id: 'e1', command: 'git status', output: 'clean', exitCode: 0, cancelled: false }]);
  });

  test('元数据条目跳过但推进 cursor', () => {
    const { items, cursor } = mapEntries([
      { type: 'thinking_level_change', id: 'm1', parentId: null, timestamp: 't', thinkingLevel: 'high' },
      { type: 'session_info', id: 'm2', parentId: null, timestamp: 't', name: 'n' },
      { type: 'compaction', id: 'm3', parentId: null, timestamp: 't' },
    ]);
    expect(items).toEqual([]);
    expect(cursor).toBe('m3');
  });

  test('垃圾输入降级：非数组/缺 id → 空形态', () => {
    expect(mapEntries(undefined)).toEqual({ items: [], cursor: null });
    expect(mapEntries([null, { type: 'message' }, 42])).toEqual({ items: [], cursor: null });
  });
});

describe('diffFromPatch', () => {
  test('统一 diff：+++ 头取路径、+/− 计数、b/ 前缀剥除', () => {
    const patch = '--- a/p/q.ts\n+++ b/p/q.ts\n@@ -1,3 +1,4 @@\n ctx\n-rem\n+add\n+add2\n ctx2';
    expect(diffFromPatch(patch)).toEqual({ path: 'p/q.ts', additions: 2, deletions: 1 });
  });

  test.each([
    ['非字符串', 42],
    ['空串', ''],
    ['无文件头', '@@ -1 +1 @@\n+x'],
  ])('垃圾：%s → null', (_name, patch) => {
    expect(diffFromPatch(patch)).toBeNull();
  });
});

describe('response-views', () => {
  test('threadListEntries：形状收窄 + 垃圾行跳过 + 非法 state 降级 parked', () => {
    const entries = threadListEntries({
      threads: [
        { threadId: 't1', cwd: '/a', sessionPath: '/s1.jsonl', isStreaming: true, state: 'live' },
        { threadId: '', cwd: '/x' },
        { threadId: 't2', cwd: '/b', sessionPath: null, isStreaming: false, state: 'weird' },
        'garbage',
      ],
    });
    expect(entries).toEqual([
      { threadId: 't1', cwd: '/a', sessionPath: '/s1.jsonl', isStreaming: true, state: 'live' },
      { threadId: 't2', cwd: '/b', sessionPath: null, isStreaming: false, state: 'parked' },
    ]);
    expect(threadListEntries({})).toEqual([]);
  });

  test('sessionFromStartResponse：合法 + 缺 threadId → null', () => {
    expect(sessionFromStartResponse({ threadId: 't9', cwd: '/w', sessionPath: '/s' }, '标题')).toMatchObject({ threadId: 't9', title: '标题', state: 'live' });
    expect(sessionFromStartResponse({ cwd: '/w' }, 'x')).toBeNull();
  });

  test('threadStateView：model.id 收窄 + 缺省降级', () => {
    expect(threadStateView({ model: { provider: 'glm', id: 'glm-5.3' }, thinkingLevel: 'high', isStreaming: true, isCompacting: false, sessionName: 'n', messageCount: 7 })).toEqual({
      model: { provider: 'glm', modelId: 'glm-5.3' },
      thinkingLevel: 'high',
      isStreaming: true,
      isCompacting: false,
      sessionName: 'n',
      messageCount: 7,
    });
    expect(threadStateView({}).model).toBeNull();
  });

  test('savedSessions：Date/字符串时间戳都收窄；缺 path 跳过', () => {
    const views = savedSessions({ sessions: [{ path: '/a.jsonl', id: 'a', cwd: '/w', name: 'N', modified: new Date(5_000), messageCount: 2, firstMessage: 'hi' }, { id: 'x' }] });
    expect(views).toEqual([{ sessionPath: '/a.jsonl', sessionId: 'a', cwd: '/w', name: 'N', modifiedAt: 5000, messageCount: 2, firstMessage: 'hi' }]);
  });

  test('modelInfos：缺 provider/id 跳过', () => {
    expect(modelInfos({ models: [{ provider: 'glm', id: 'm1' }, { provider: '', id: 'm2' }, 3] })).toEqual([{ provider: 'glm', modelId: 'm1' }]);
  });

  test('sessionStatsView：contextUsage.percent 直取；垃圾 → null', () => {
    expect(sessionStatsView({ userMessages: 2, assistantMessages: 3, toolCalls: 4, tokens: { total: 99 }, cost: 0.5, contextUsage: { tokens: 10, contextWindow: 100, percent: 0.1 } })).toEqual({
      userMessages: 2,
      assistantMessages: 3,
      toolCalls: 4,
      tokensTotal: 99,
      cost: 0.5,
      contextUsage: 0.1,
    });
    expect(sessionStatsView({}).contextUsage).toBeNull();
  });

  test('thinkingLevels：levels 列表 + current', () => {
    expect(thinkingLevels({ current: 'high', levels: ['off', 'high'] })).toEqual({ current: 'high', allowed: ['off', 'high'] });
    expect(thinkingLevels(null)).toEqual({ current: '', allowed: [] });
  });
});
