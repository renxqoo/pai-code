import { expect, test } from 'bun:test';

import { agentViews, sessionCommands } from '../response-views';

/** get_commands 收窄回归：三源透传、垃圾降级。 */

test('三源条目透传，description 缺失收窄 null', () => {
  const raw = {
    commands: [
      { name: '/review', description: 'Review the diff', source: 'extension' },
      { name: '/deploy', source: 'prompt' },
      { name: 'skill:writer', description: '写文档', source: 'skill' },
    ],
  };
  expect(sessionCommands(raw)).toEqual([
    { name: '/review', description: 'Review the diff', source: 'extension' },
    { name: '/deploy', description: null, source: 'prompt' },
    { name: 'skill:writer', description: '写文档', source: 'skill' },
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
  expect(kept.every((item) => item.source === 'extension' || item.source === 'prompt' || item.source === 'skill')).toBe(true);
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

test('agents/list 收窄：两源透传，tools/model 缺失收窄 null', () => {
  const raw = {
    agents: [
      { name: 'reviewer', description: 'Code review', source: 'user', tools: ['read', 'grep'] },
      { name: 'deployer', description: 'Deploys', source: 'project', model: 'glm/glm-4.7' },
    ],
  };
  expect(agentViews(raw)).toEqual([
    { name: 'reviewer', description: 'Code review', source: 'user', tools: ['read', 'grep'], model: null },
    { name: 'deployer', description: 'Deploys', source: 'project', tools: null, model: 'glm/glm-4.7' },
  ]);
});

test('agents/list 垃圾降级：缺名/source 词表外/非对象丢弃，非字符串 tools 项过滤', () => {
  const kept = agentViews({
    agents: [
      { description: 'x', source: 'user' },
      { name: 'a', source: 'mcp' },
      'junk',
      42,
      { name: 'ok', description: '', source: 'user', tools: ['read', 7, null] },
    ],
  });
  expect(kept).toEqual([{ name: 'ok', description: '', source: 'user', tools: ['read'], model: null }]);
});

test('agents/list 顶层非对象/非数组 → 空数组', () => {
  expect(agentViews({ agents: 'x' })).toEqual([]);
  expect(agentViews(null)).toEqual([]);
});
