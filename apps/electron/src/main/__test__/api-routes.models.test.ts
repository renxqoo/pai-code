import { describe, expect, test } from 'bun:test';

import type { ModelInfoView } from '@paiapp/contracts';

import { channelScopedModels } from '../api-routes';

/**
 * 选择面渠道真相域：hub get_models 会带回内置目录模型（环境有对应凭据即「可用」），
 * 但 app 的唯一模型/凭据面是设置里的渠道——症状回归：选择模型弹窗出现渠道外的模型。
 */
const models = (items: Array<[string, string]>): ModelInfoView[] =>
  items.map(([provider, modelId]) => ({ provider, modelId }));

describe('模型清单渠道真相域过滤', () => {
  test('只保留已配置渠道的模型；内置目录/未知渠道模型全部剔除', () => {
    const input = models([
      ['glm', 'glm-4.7'],
      ['zhipu', 'glm-4.6'],
      ['anthropic', 'claude-sonnet-4-5'],
      ['openai', 'gpt-5'],
    ]);
    expect(channelScopedModels(input, new Set(['glm']))).toEqual(models([['glm', 'glm-4.7']]));
    expect(channelScopedModels(input, new Set(['glm', 'zhipu']))).toEqual(
      models([['glm', 'glm-4.7'], ['zhipu', 'glm-4.6']]),
    );
  });

  test('空渠道集 → 空清单（未配置任何渠道时不出现任何可选项）', () => {
    expect(channelScopedModels(models([['anthropic', 'claude-opus-4-6']]), new Set())).toEqual([]);
  });

  test('渠道内多模型全保留（同名渠道是 app 写入 models.json 的键，逐模型过滤不误伤）', () => {
    const input = models([
      ['glm', 'glm-4.6'],
      ['glm', 'glm-4.7'],
      ['glm', 'glm-5'],
    ]);
    expect(channelScopedModels(input, new Set(['glm']))).toEqual(input);
  });
});
