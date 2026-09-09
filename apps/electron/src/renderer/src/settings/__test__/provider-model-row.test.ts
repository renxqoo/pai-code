import { describe, expect, test } from 'bun:test';

import type { ProviderModel } from '@paiapp/contracts';

import { copy } from '@/strings';

import { ProviderModelRow } from '../provider-model-row';
import { clickByLabel, collectElementProps } from './element-props';

const model: ProviderModel = { id: 'glm-4.6', reasoning: false, vision: true };

describe('模型行回调接线', () => {
  test('思考/视觉按钮分别回传 reasoning 与 vision', () => {
    const toggles: string[] = [];
    const tree = ProviderModelRow({ model, onToggle: (flag) => toggles.push(flag), onRemove: () => undefined });
    clickByLabel(tree, copy.settings.modelThinkingOff);
    clickByLabel(tree, copy.settings.modelVisionOn);
    expect(toggles).toEqual(['reasoning', 'vision']);
  });

  test('移除按钮回传 onRemove', () => {
    let removed = 0;
    const tree = ProviderModelRow({
      model,
      onToggle: () => undefined,
      onRemove: () => {
        removed += 1;
      },
    });
    clickByLabel(tree, copy.settings.providerModelRemove);
    expect(removed).toBe(1);
  });

  test('能力按钮可访问名随声明状态翻转（aria-pressed 同步）', () => {
    const tree = ProviderModelRow({ model: { ...model, reasoning: true }, onToggle: () => undefined, onRemove: () => undefined });
    const props = collectElementProps(tree);
    expect(props.find((p) => p['aria-label'] === copy.settings.modelThinkingOn)?.['aria-pressed']).toBe(true);
    expect(props.find((p) => p['aria-label'] === copy.settings.modelVisionOn)?.['aria-pressed']).toBe(true);
  });
});
