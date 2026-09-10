import { describe, expect, test } from 'bun:test';

import { previewCommands, sessionCommands, hostInfoView, threadListRows } from '../response-views';

/** get_commands 收窄回归：四源透传（含 hub builtin 内置命令）、垃圾降级。 */

test('四源条目透传，description 缺失收窄 null', () => {
  const raw = {
    commands: [
      { name: '/review', description: 'Review the diff', source: 'extension' },
      { name: '/deploy', source: 'prompt' },
      { name: 'skill:writer', description: '写文档', source: 'skill' },
      { name: 'compact', description: 'Manually compact the session context', source: 'builtin' },
    ],
  };
  expect(sessionCommands(raw)).toEqual([
    { name: '/review', description: 'Review the diff', source: 'extension' },
    { name: '/deploy', description: null, source: 'prompt' },
    { name: 'skill:writer', description: '写文档', source: 'skill' },
    { name: 'compact', description: 'Manually compact the session context', source: 'builtin' },
  ]);
});

test.each([
  ['缺名丢弃', [{ description: 'x', source: 'prompt' }]],
  ['空名丢弃', [{ name: '', source: 'prompt' }]],
  ['source 词表外丢弃', [{ name: '/x', source: 'mcp' }]],
  ['非对象条目丢弃', ['/review', 42, null]],
  ['description 非字符串收窄 null', [{ name: '/x', description: 7, source: 'prompt' }]],
])('垃圾降级：%s', (_name, commands) => {
  const kept = sessionCommands({ commands });
  expect(kept.every((item) => typeof item.name === 'string' && item.name.length > 0)).toBe(true);
  expect(kept.every((item) => item.source === 'extension' || item.source === 'prompt' || item.source === 'skill' || item.source === 'builtin')).toBe(true);
});

test('commands 非数组 / 顶层非对象 → 空数组', () => {
  expect(sessionCommands({ commands: 'nope' })).toEqual([]);
  expect(sessionCommands(null)).toEqual([]);
  expect(sessionCommands([1, 2])).toEqual([]);
});

test('混合垃圾条目中合法条目保留', () => {
  const kept = sessionCommands({
    commands: [{ name: '/ok', source: 'prompt' }, { name: 1, source: 'prompt' }, 'junk'],
  });
  expect(kept).toEqual([{ name: '/ok', description: null, source: 'prompt' }]);
});

/** 预会话目录（新建任务页 `/` 补全）：技能清单 → get_commands 的 skill 源同型条目。 */

test('技能名加 skill: 前缀成 skill 源条目，description 原样透传（含 null）', () => {
  expect(
    previewCommands([
      { name: 'rxopen-hot', description: '查热搜' },
      { name: 'writer', description: null },
    ]),
  ).toEqual([
    { name: 'skill:rxopen-hot', description: '查热搜', source: 'skill' },
    { name: 'skill:writer', description: null, source: 'skill' },
  ]);
});

test('空名技能丢弃；空清单 → 空目录', () => {
  expect(previewCommands([{ name: '', description: 'x' }])).toEqual([]);
  expect(previewCommands([])).toEqual([]);
});



describe('hostInfoView（get_host_info 收窄）', () => {
  test('全字段 round-trip', () => {
    const data = {
      version: '0.13.0', piVersion: '0.85.1', bunVersion: '1.4.2', pid: 42, uptimeMs: 1000, rssBytes: 2048,
      threads: { live: 1, parked: 2, dead: 3 }, subagents: { running: 4 },
      limits: { maxThreads: 32, idleRetireMs: 300000, workerStaleMs: 30000, workerExitTimeoutMs: 10000, maxSubagents: 8, bashTimeoutMs: 600000 },
      backend: { id: 'pi-coding-agent', version: '0.85.1', capabilities: ['session.fork', 1] },
    };
    expect(hostInfoView(data)).toEqual({
      version: '0.13.0', piVersion: '0.85.1', bunVersion: '1.4.2', pid: 42, uptimeMs: 1000, rssBytes: 2048,
      threads: { live: 1, parked: 2, dead: 3 }, subagents: { running: 4 },
      limits: { maxThreads: 32, idleRetireMs: 300000, workerStaleMs: 30000, workerExitTimeoutMs: 10000, maxSubagents: 8, bashTimeoutMs: 600000 },
      backend: { id: 'pi-coding-agent', version: '0.85.1', capabilities: ['session.fork'] },
    });
  });

  test('垃圾输入降级全零形态不抛', () => {
    const view = hostInfoView('junk');
    expect(view.pid).toBe(0);
    expect(view.threads).toEqual({ live: 0, parked: 0, dead: 0 });
    expect(view.backend.capabilities).toEqual([]);
  });
});

describe('threadListRows（thread/list 行收窄）', () => {
  test('合法行 + 观测字段（rss null 容错）', () => {
    const rows = threadListRows({ threads: [
      { threadId: 't1', cwd: '/w', sessionPath: '/w/s.jsonl', isStreaming: true, state: 'live', idleMs: 12, subagents: 2, rssBytes: 111, keepalive: true },
      { threadId: 't2', cwd: '/w', sessionPath: null, isStreaming: false, state: 'parked', idleMs: 0, subagents: 0, rssBytes: null, keepalive: false },
    ] });
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ threadId: 't1', state: 'live', idleMs: 12, rssBytes: 111, keepalive: true });
    expect(rows[1]).toMatchObject({ threadId: 't2', state: 'parked', rssBytes: null });
  });

  test('缺 threadId 丢弃；非数组降级空；非法 state 收窄 dead', () => {
    expect(threadListRows({ threads: [{ cwd: '/w' }, { threadId: 'ok', state: 'weird' }] }).length).toBe(1);
    expect(threadListRows({})).toEqual([]);
    expect(threadListRows(null)).toEqual([]);
    expect(threadListRows({ threads: [{ threadId: 't', state: 'weird' }] })[0]?.state).toBe('dead');
  });
});
