import { describe, expect, test } from 'bun:test';

import { subagentsField, subagentSpawnsOf } from '../subagent-spawns';

describe('subagentSpawnsOf · agent_spawn 工具参数展开', () => {
  test.each([
    ['{prompt, subagent_type} 单发形态', { prompt: '扫描现状', subagent_type: 'explore' }, [{ agent: 'explore', task: '扫描现状' }]],
    ['subagent_type 缺省回退 description 摘要', { prompt: '写摘要', description: 'summary-writer' }, [{ agent: 'summary-writer', task: '写摘要' }]],
    ['双身份并存 subagent_type 优先', { prompt: 'T', subagent_type: 'explore', description: '别名' }, [{ agent: 'explore', task: 'T' }]],
    ['只有 prompt：agent 回落通用名', { prompt: '做点什么' }, [{ agent: 'agent', task: '做点什么' }]],
    ['只有 subagent_type：task 空串仍保留（半形状不整项丢弃）', { subagent_type: 'explore' }, [{ agent: 'explore', task: '' }]],
    ['model/isolation 等附加字段不进清单', { prompt: 'T', subagent_type: 'explore', model: 'glm-5.3', isolation: 'sandbox' }, [{ agent: 'explore', task: 'T' }]],
    ['空白 subagent_type 折叠后为空，回退 description', { prompt: 'T', subagent_type: '  ', description: 'writer' }, [{ agent: 'writer', task: 'T' }]],
  ])('%s', (_name, args, expected) => {
    expect(subagentSpawnsOf('agent_spawn', args as Record<string, unknown>)).toEqual(expected);
  });

  test.each([
    ['旧协议工具名 agent 不展开（词表换代防误读）', 'agent', { prompt: 'T', subagent_type: 'explore' }],
    ['task 是旧协议工具名，不展开', 'task', { prompt: 'T', subagent_type: 'explore' }],
    ['read 同样不展开', 'read', { prompt: 'T' }],
    ['write 同样不展开', 'write', { prompt: 'T' }],
  ])('%s', (_name, tool, args) => {
    expect(subagentSpawnsOf(tool, args as Record<string, unknown>)).toEqual([]);
  });

  test('工具名大小写与空白不敏感（trim + toLowerCase 判定）', () => {
    expect(subagentSpawnsOf('Agent_Spawn', { prompt: 'T' })).toEqual([{ agent: 'agent', task: 'T' }]);
    expect(subagentSpawnsOf(' AGENT_SPAWN ', { prompt: 'T', subagent_type: 'explore' })).toEqual([{ agent: 'explore', task: 'T' }]);
  });

  test.each([
    ['空参数（prompt 与 agent 双空）', {}],
    ['垃圾形状（无 prompt/subagent_type/description）', { model: 'm', isolation: 'sandbox' }],
    ['字段非字符串（clip 后为空，agent 回落通用名再因 prompt 空而空）', { prompt: 42, subagent_type: 7, description: {} }],
  ])('空形态降级：%s', (_name, args) => {
    expect(subagentSpawnsOf('agent_spawn', args as Record<string, unknown>)).toEqual([]);
  });

  test('多行 prompt 折叠单行并截断到 160（预览域同一语义）', () => {
    const spawns = subagentSpawnsOf('agent_spawn', { prompt: `a\n b\t${'c'.repeat(300)}` });
    expect(spawns).toHaveLength(1);
    const task = spawns[0]?.task ?? '';
    expect(task.length).toBe(160);
    expect(task.endsWith('…')).toBe(true);
    expect(task.startsWith('a b ccc')).toBe(true);
  });

  test('description 回退值同样过 clip（空白折叠 + 160 截断后才作 agent 名）', () => {
    const spawns = subagentSpawnsOf('agent_spawn', { prompt: 'T', description: `d\n e\t${'f'.repeat(200)}` });
    expect(spawns).toHaveLength(1);
    const agent = spawns[0]?.agent ?? '';
    expect(agent.length).toBe(160);
    expect(agent.startsWith('d e fff')).toBe(true);
    expect(agent.endsWith('…')).toBe(true);
  });
});

describe('subagentsField · 空展开不携带字段', () => {
  test('agent_spawn 非空展开携带字段', () => {
    expect(subagentsField('agent_spawn', { prompt: 'T', subagent_type: 'explore' })).toEqual({
      subagents: [{ agent: 'explore', task: 'T' }],
    });
  });
  test('空展开返回空对象（wire 不携带）', () => {
    expect(subagentsField('read', { path: 'x.ts' })).toEqual({});
    expect(subagentsField('agent_spawn', {})).toEqual({});
  });
});
