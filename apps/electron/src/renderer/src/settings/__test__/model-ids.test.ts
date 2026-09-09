import { describe, expect, test } from 'bun:test';

import type { ProviderModel } from '@paiapp/contracts';
import { mergeModelIds, parseModelIds, toggleModelFlag } from '../model-ids';

const glm: ProviderModel = { id: 'glm-4.6', reasoning: true, vision: false };

describe('模型 id 纯函数', () => {
  test('切分：半角/全角逗号与换行，trim 后丢弃空项', () => {
    expect(parseModelIds(' a, b，c\nd ,, \n ')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseModelIds(' , \n ')).toEqual([]);
  });

  test('并入：去重保序，新录入默认不声明思考/视觉', () => {
    expect(mergeModelIds([glm], ['glm-4.6', 'glm-5'])).toEqual([glm, { id: 'glm-5', reasoning: false, vision: false }]);
    expect(mergeModelIds([], [])).toEqual([]);
  });

  test('切换能力位：命中项翻转，其余原样', () => {
    const models: readonly ProviderModel[] = [glm, { id: 'glm-5', reasoning: false, vision: true }];
    expect(toggleModelFlag(models, 'glm-4.6', 'reasoning')).toEqual([
      { id: 'glm-4.6', reasoning: false, vision: false },
      { id: 'glm-5', reasoning: false, vision: true },
    ]);
    expect(toggleModelFlag(models, 'glm-5', 'vision')).toEqual([glm, { id: 'glm-5', reasoning: false, vision: false }]);
  });

  test('切换能力位：id 不存在时列表内容不变', () => {
    expect(toggleModelFlag([glm], 'missing', 'reasoning')).toEqual([glm]);
  });
});
