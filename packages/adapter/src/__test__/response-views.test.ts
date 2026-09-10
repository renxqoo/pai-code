import { expect, test } from 'bun:test';

import { previewCommands, sessionCommands } from '../response-views';

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

