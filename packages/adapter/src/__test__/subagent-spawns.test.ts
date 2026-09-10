import { describe, expect, test } from 'bun:test';

import { subagentsField, subagentSpawnsOf } from '../subagent-spawns';

describe('subagentSpawnsOf · task 参数展开', () => {
  test.each([
    ['single 模式 {agent, task}', { agent: 'Explore', task: '分析 pai-cli sandbox 现状' }, [{ agent: 'Explore', task: '分析 pai-cli sandbox 现状' }]],
    [
      'parallel 模式 tasks 数组逐项展开',
      { tasks: [{ agent: 'Explore', task: '分析 A' }, { agent: 'general-purpose', task: '调研 B' }] },
      [
        { agent: 'Explore', task: '分析 A' },
        { agent: 'general-purpose', task: '调研 B' },
      ],
    ],
    ['chain 模式 chain 数组逐项展开', { chain: [{ agent: 'Explore', task: '第一步' }, { agent: 'Explore', task: '第二步' }] }, [
      { agent: 'Explore', task: '第一步' },
      { agent: 'Explore', task: '第二步' },
    ]],
    ['tasks 优先于 chain（与 hub 模式判定同序）', { tasks: [{ agent: 'A', task: 'x' }], chain: [{ agent: 'B', task: 'y' }] }, [{ agent: 'A', task: 'x' }]],
    ['cwd 等附加字段不进清单', { agent: 'Explore', task: 'T', cwd: '/tmp' }, [{ agent: 'Explore', task: 'T' }]],
    [
      '症状回归：空 tasks 数组不算数组模式，single 字段照常展开（hub 长度>0 才成立）',
      { agent: 'Explore', task: 'T', tasks: [] },
      [{ agent: 'Explore', task: 'T' }],
    ],
    [
      '双模式并存按 tasks 展开（hub 会拒绝该调用，行显失败；宽容展开只影响展示）',
      { tasks: [{ agent: 'A', task: 'x' }], agent: 'B', task: 'y' },
      [{ agent: 'A', task: 'x' }],
    ],
    ['缺 task 只留 agent 仍保留（半形状不整项丢弃）', { agent: 'Explore' }, [{ agent: 'Explore', task: '' }]],
    ['缺 agent 只留 task 仍保留', { task: 'T' }, [{ agent: '', task: 'T' }]],
  ])('%s', (_name, args, expected) => {
    expect(subagentSpawnsOf('task', args as Record<string, unknown>)).toEqual(expected);
  });

  test.each([
    ['非 task 工具不展开', 'read', { agent: 'Explore', task: 'T' }],
    ['write 同样不展开', 'write', { agent: 'Explore', task: 'T' }],
  ])('%s', (_name, tool, args) => {
    expect(subagentSpawnsOf(tool, args as Record<string, unknown>)).toEqual([]);
  });

  test('工具名大小写不敏感（协议侧小写，演示与扩展出现过大写）', () => {
    expect(subagentSpawnsOf('Task', { agent: 'Explore', task: 'T' })).toEqual([{ agent: 'Explore', task: 'T' }]);
    expect(subagentSpawnsOf(' task ', { agent: 'Explore', task: 'T' })).toEqual([{ agent: 'Explore', task: 'T' }]);
  });

  test.each([
    ['空参数', {}],
    ['垃圾形状（无 agent/task 的杂项）', { background: true, cwd: '/tmp' }],
    ['tasks 非数组回落 single', { tasks: 'nope' }],
    ['数组元素非对象逐个丢弃', { tasks: ['x', 3, null] }],
    ['数组元素全缺 agent/task', { tasks: [{ cwd: '/tmp' }, {}] }],
  ])('空形态降级：%s', (_name, args) => {
    expect(subagentSpawnsOf('task', args as Record<string, unknown>)).toEqual([]);
  });

  test('多行任务文本折叠单行并截断到 160（预览域同一语义）', () => {
    const spawns = subagentSpawnsOf('task', { agent: 'Explore', task: `a\n b\t${'c'.repeat(300)}` });
    expect(spawns).toHaveLength(1);
    const task = spawns[0]?.task ?? '';
    expect(task.length).toBe(160);
    expect(task.endsWith('…')).toBe(true);
    expect(task.startsWith('a b ccc')).toBe(true);
  });
});

describe('subagentsField · 空展开不携带字段', () => {
  test('非空展开携带字段', () => {
    expect(subagentsField('task', { agent: 'Explore', task: 'T' })).toEqual({
      subagents: [{ agent: 'Explore', task: 'T' }],
    });
  });
  test('空展开返回空对象（wire 不携带）', () => {
    expect(subagentsField('read', { path: 'x.ts' })).toEqual({});
    expect(subagentsField('task', {})).toEqual({});
  });
});
