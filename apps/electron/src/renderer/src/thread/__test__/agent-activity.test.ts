import { describe, expect, test } from 'bun:test';

import { agentActivity, panelStatusLabelKey, streamStatusLabelKey } from '../agent-activity';
import { latestActiveAgent } from '../active-subagent';
import type { SubagentModel, ToolCallModel } from '../thread-model';

const call = (overrides: Partial<ToolCallModel>): ToolCallModel => ({
  id: 't1',
  name: 'Read',
  argsPreview: 'src/index.ts',
  output: '',
  exitCode: 0,
  durationMs: 1200,
  status: 'ok',
  ...overrides,
});

function agent(overrides: Partial<SubagentModel>): SubagentModel {
  return {
    id: 'a1',
    name: '分析 router 实现',
    agentType: 'Explore',
    model: 'glm-5.3',
    effort: 'high',
    tokens: 51,
    toolCount: 1,
    status: 'working',
    startedAt: 1000,
    endedAt: null,
    summary: '报告',
    tools: [],
    ...overrides,
  };
}

describe('agentActivity', () => {
  test('有工具在跑 → tool，流内显 Working、面板显工具行', () => {
    const subject = agent({ tools: [call({ status: 'running' })] });
    expect(agentActivity(subject, 2000)).toEqual({ kind: 'tool', toolName: 'Read' });
    expect(streamStatusLabelKey(agentActivity(subject, 2000))).toBe('working');
    expect(panelStatusLabelKey(agentActivity(subject, 2000))).toBeNull();
  });

  test('两段工具之间 → pause，流内显 Thinking、面板显 Working（同一数据两种视图）', () => {
    const subject = agent({ tools: [] });
    expect(agentActivity(subject, 2000)).toEqual({ kind: 'pause' });
    expect(streamStatusLabelKey(agentActivity(subject, 2000))).toBe('thinking');
    expect(panelStatusLabelKey(agentActivity(subject, 2000))).toBe('working');
  });

  test('已结束 / 尚未出生 / 时间倒挂 → idle', () => {
    expect(agentActivity(agent({ status: 'done' }), 9999)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ startedAt: 5000 }), 1000)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ startedAt: 5000, endedAt: 1000 }), 3000)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ status: 'done' }), Number.NaN)).toEqual({ kind: 'idle' });
  });
});

describe('latestActiveAgent', () => {
  test('取最近派生且仍在活动的子代理', () => {
    const early = agent({ id: 'early', startedAt: 1000, status: 'working' });
    const late = agent({ id: 'late', startedAt: 2000, status: 'working' });
    const done = agent({ id: 'done', startedAt: 3000, status: 'done' });
    expect(latestActiveAgent([early, late, done])?.id).toBe('late');
  });

  test('全部结束时返回 null（简略行并入通知条摘要）', () => {
    expect(latestActiveAgent([agent({ status: 'done' })])).toBeNull();
    expect(latestActiveAgent([])).toBeNull();
  });
});
