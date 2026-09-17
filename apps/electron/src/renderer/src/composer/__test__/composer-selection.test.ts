import { describe, expect, test } from 'bun:test';

import { composerSelectionOf } from '../composer-selection';
import type { ModelInfoView, SessionView } from '@paiapp/contracts';
import type { ThinkingLevelStateView } from '@/live/store';

/** 模型/思考档选择数据面派生（自 buildComposer 同构迁出，语义基线随迁）。 */

function model(provider: string, modelId: string): ModelInfoView {
  return { provider, modelId, reasoning: true } as ModelInfoView;
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

const thinking = (level: string, source: ThinkingLevelStateView['source'] = 'session'): ThinkingLevelStateView => ({ level, source });

describe('composerSelectionOf', () => {
  test('会话模型优先；无会话回落首个可用模型；无模型留空', () => {
    const models = [model('openai', 'gpt-5.3'), model('anthropic', 'claude-4')];
    expect(composerSelectionOf(models, session(), null).model).toBe('openai/gpt-5.3');
    expect(composerSelectionOf(models, undefined, null).model).toBe('openai/gpt-5.3');
    expect(composerSelectionOf([], undefined, null).model).toBe('');
    expect(composerSelectionOf(models, undefined, null).modelOptions).toEqual(['openai/gpt-5.3', 'anthropic/claude-4']);
  });

  test('思考档恒四档菜单：读口事实优先 → 会话视图兜底 → 缺失/词表外回落首档', () => {
    // 读口事实（get_thinking_level）优先于会话视图携带档位
    expect(composerSelectionOf([], session({ thinkingLevel: 'high' }), thinking('low')).effort).toBe('Low');
    // 会话视图兜底（parked 未发 worker 级查询，思考档控件回落会话视图携带档位）
    expect(composerSelectionOf([], session({ thinkingLevel: 'high' }), null).effort).toBe('High');
    // 缺失回落首档——菜单始终可选，选择即显式设置
    expect(composerSelectionOf([], session(), null).effort).toBe('Off');
    // 'unset'（词表外读回值）同样回落首档
    expect(composerSelectionOf([], session(), thinking('unset', 'unset')).effort).toBe('Off');
    // 四档展示名（词表顺序即菜单顺序）
    expect(composerSelectionOf([], undefined, null).effortOptions).toEqual(['Off', 'Low', 'Medium', 'High']);
  });
});
