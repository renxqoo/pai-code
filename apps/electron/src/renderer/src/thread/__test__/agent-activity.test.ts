import { describe, expect, test } from 'bun:test';

import { agentActivity } from '../agent-activity';
import type { SubagentModel, ToolCallModel } from '../thread-model';

const call = (overrides: Partial<ToolCallModel>): ToolCallModel => ({
  id: 't1',
  name: 'Read',
  argsPreview: 'src/index.ts',
  subagents: [],
  output: '',
  exitCode: 0,
  durationMs: 1200,
  status: 'ok',
  ...overrides,
});

function agent(overrides: Partial<SubagentModel>): SubagentModel {
  return {
    id: 'a1',
    agentId: 'sub-1',
    name: '分析 router 实现',
    agentType: 'Explore',
    task: '',
    model: 'glm-5.3',
    effort: 'high',
    tokens: 51,
    toolCount: 1,
    status: 'running',
    startedAt: 1000,
    endedAt: null,
    summary: '报告',
    pendingAsk: null,
    tools: [],
    ...overrides,
  };
}

describe('agentActivity', () => {
  test('有工具在跑 → tool（面板行显当前工具名）', () => {
    const subject = agent({ tools: [call({ status: 'running' })] });
    expect(agentActivity(subject, 2000)).toEqual({ kind: 'tool', toolName: 'Read' });
  });

  test('两段工具之间 → pause（面板行显状态词）', () => {
    const subject = agent({ tools: [] });
    expect(agentActivity(subject, 2000)).toEqual({ kind: 'pause' });
  });

  test('已结束 / 尚未出生 / 时间倒挂 → idle', () => {
    expect(agentActivity(agent({ status: 'stopped' }), 9999)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ startedAt: 5000 }), 1000)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ startedAt: 5000, endedAt: 1000 }), 3000)).toEqual({ kind: 'idle' });
    expect(agentActivity(agent({ status: 'stopped' }), Number.NaN)).toEqual({ kind: 'idle' });
    // 空闲态（busy|idle|on-disk 三态）同归 idle
    expect(agentActivity(agent({ status: 'idle' }), 2000)).toEqual({ kind: 'idle' });
  });
});
