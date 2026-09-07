import { describe, expect, test } from 'bun:test';

import { agentElapsedMs, summarizeAgents } from '../panel-summary';
import type { SubagentModel } from '../thread-model';

function agent(overrides: Partial<SubagentModel>): SubagentModel {
  return {
    id: 'a1',
    name: '分析测试/基准/工程化',
    agentType: 'general-purpose',
    model: 'fable-5-1',
    effort: 'high',
    tokens: null,
    toolCount: 0,
    status: 'working',
    startedAt: 1000,
    endedAt: null,
    summary: '',
    tools: [],
    ...overrides,
  };
}

describe('summarizeAgents', () => {
  test('进行中 / 已完成计数与 token 合计（4 working Σ 196）', () => {
    const summary = summarizeAgents([
      agent({ id: '1', status: 'working', tokens: 51 }),
      agent({ id: '2', status: 'working', tokens: 51 }),
      agent({ id: '3', status: 'working', tokens: 94 }),
      agent({ id: '4', status: 'working', tokens: null }),
    ]);
    expect(summary).toEqual({ workingCount: 4, settledCount: 0, totalTokens: 196 });
  });

  test('无进行中时给出完成态汇总', () => {
    const summary = summarizeAgents([
      agent({ id: '1', status: 'done', tokens: 51 }),
      agent({ id: '2', status: 'done', tokens: 61 }),
    ]);
    expect(summary).toEqual({ workingCount: 0, settledCount: 2, totalTokens: 112 });
  });

  test('空列表与非有限 token 降级', () => {
    expect(summarizeAgents([])).toEqual({ workingCount: 0, settledCount: 0, totalTokens: 0 });
    expect(summarizeAgents([agent({ tokens: Number.NaN })]).totalTokens).toBe(0);
  });
});

describe('agentElapsedMs', () => {
  test('进行中实时累加，已完成冻结', () => {
    expect(agentElapsedMs({ startedAt: 1000, endedAt: null }, 30_000)).toBe(29_000);
    expect(agentElapsedMs({ startedAt: 1000, endedAt: 8000 }, 999_999)).toBe(7000);
  });

  test('垃圾输入降级为 0', () => {
    expect(agentElapsedMs({ startedAt: Number.NaN, endedAt: null }, 30_000)).toBe(0);
    expect(agentElapsedMs({ startedAt: 5000, endedAt: 1000 }, 30_000)).toBe(0);
  });
});
