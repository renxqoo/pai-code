import { describe, expect, test } from 'bun:test';

import { composerSelectionOf } from '../composer-selection';
import type { ModelInfoView, SessionStatsView, SessionView } from '@paiapp/contracts';

/** 模型/思考档选择数据面派生（自 buildComposer 同构迁出，语义基线随迁）。 */

function model(provider: string, modelId: string): ModelInfoView {
  return { provider, modelId, supportedThinkingLevels: ['medium', 'high'] } as ModelInfoView;
}

function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    threadId: 't1',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/s/t1.jsonl',
    title: '会话',
    state: 'live',
    streaming: false,
    model: 'openai/gpt-5.3',
    thinkingLevel: null,
    lastActivityAt: 1000,
    ...overrides,
  };
}

describe('composerSelectionOf', () => {
  test('会话模型优先；无会话回落首个可用模型；无模型留空', () => {
    const models = [model('openai', 'gpt-5.3'), model('anthropic', 'claude-4')];
    expect(composerSelectionOf(models, {}, session(), []).model).toBe('openai/gpt-5.3');
    expect(composerSelectionOf(models, {}, undefined, []).model).toBe('openai/gpt-5.3');
    expect(composerSelectionOf([], {}, undefined, []).model).toBe('');
    expect(composerSelectionOf(models, {}, undefined, []).modelOptions).toEqual(['openai/gpt-5.3', 'anthropic/claude-4']);
  });

  test('思考档：会话档位优先（展示名映射）；未知/缺失回落首档；无档留空（触发禁用）', () => {
    const levels = ['medium', 'high'];
    expect(composerSelectionOf([], {}, session({ thinkingLevel: 'high' }), levels).effort).toBe('High'); // 展示名映射经 thinkingLevelLabel（测试环境 locale 为英文）
    expect(composerSelectionOf([], {}, session(), levels).effort).toBe('Medium'); // 回落首档（展示名）
    expect(composerSelectionOf([], {}, session(), []).effort).toBe('');
    expect(composerSelectionOf([], {}, undefined, levels).effortOptions).toEqual(['Medium', 'High']); // 选项输出为展示名
  });

  test('contextUsed 取活跃会话 stats；未拉取为 0', () => {
    const stats: Record<string, SessionStatsView> = {
      t1: { contextUsage: 42, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 } as SessionStatsView,
    };
    expect(composerSelectionOf([], stats, session(), []).contextUsed).toBe(42);
    expect(composerSelectionOf([], {}, session(), []).contextUsed).toBe(0);
  });
});
