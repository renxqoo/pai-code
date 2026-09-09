import { describe, expect, test } from 'bun:test';

import type { ProviderModel } from '@paiapp/contracts';

import { copy } from '@/strings';

import { ProviderModelList } from '../provider-model-list';
import { clickByText, collectElementProps, findElementProps } from './element-props';

/** 受控输入的按键事件替身：只带组件读取到的字段。 */
function keyEvent(key: string, options: { composing?: boolean } = {}): { key: string; nativeEvent: { isComposing: boolean }; preventDefault: () => void } {
  return { key, nativeEvent: { isComposing: options.composing ?? false }, preventDefault: () => undefined };
}

/** 挂载模型清单，收集 onModelsChange / onDraftChange 的调用参数。 */
function mountList(input: { models: readonly ProviderModel[]; draft: string }) {
  const modelsChanges: ProviderModel[][] = [];
  const draftChanges: string[] = [];
  const tree = ProviderModelList({
    models: input.models,
    onModelsChange: (models) => modelsChanges.push(models),
    draft: input.draft,
    onDraftChange: (draft) => draftChanges.push(draft),
  });
  return { tree, modelsChanges, draftChanges };
}

function draftInput(tree: ReturnType<typeof mountList>['tree']): ReturnType<typeof findElementProps> {
  return findElementProps(tree, (props) => props['aria-label'] === copy.settings.providerModelPlaceholder);
}

const glm: ProviderModel = { id: 'glm-4.6', reasoning: true, vision: false };

describe('模型清单回调接线', () => {
  test('回车收编草稿：并入模型、清空草稿、拦掉表单提交', () => {
    const { tree, modelsChanges, draftChanges } = mountList({ models: [], draft: 'glm-4.6' });
    let prevented = 0;
    const event = keyEvent('Enter');
    event.preventDefault = () => {
      prevented += 1;
    };
    (draftInput(tree)['onKeyDown'] as (event: unknown) => void)(event);
    expect(modelsChanges).toEqual([[{ id: 'glm-4.6', reasoning: false, vision: false }]]);
    expect(draftChanges).toEqual(['']);
    expect(prevented).toBe(1);
  });

  test('输入法组词中的回车 / 空草稿回车 / 其他按键都不收编', () => {
    for (const event of [keyEvent('Enter', { composing: true }), keyEvent('Enter'), keyEvent('Tab')]) {
      const { tree, modelsChanges, draftChanges } = mountList({ models: [], draft: '   ' });
      (draftInput(tree)['onKeyDown'] as (event: unknown) => void)(event);
      expect(modelsChanges).toEqual([]);
      expect(draftChanges).toEqual([]);
    }
  });

  test('输入逗号即收编已输入内容并清空草稿', () => {
    const { tree, modelsChanges, draftChanges } = mountList({ models: [], draft: '' });
    (draftInput(tree)['onChange'] as (event: { target: { value: string } }) => void)({ target: { value: 'glm-4.6,' } });
    expect(modelsChanges).toEqual([[{ id: 'glm-4.6', reasoning: false, vision: false }]]);
    expect(draftChanges).toEqual(['']);
  });

  test('普通输入只更新草稿，不动模型列表', () => {
    const { tree, modelsChanges, draftChanges } = mountList({ models: [], draft: '' });
    (draftInput(tree)['onChange'] as (event: { target: { value: string } }) => void)({ target: { value: 'glm' } });
    expect(modelsChanges).toEqual([]);
    expect(draftChanges).toEqual(['glm']);
  });

  test('添加按钮：草稿为空时无动作，非空时并入并清空', () => {
    const empty = mountList({ models: [], draft: ' , ' });
    clickByText(empty.tree, copy.settings.providerModelAdd);
    expect(empty.modelsChanges).toEqual([]);
    expect(empty.draftChanges).toEqual([]);

    const filled = mountList({ models: [glm], draft: 'glm-5' });
    clickByText(filled.tree, copy.settings.providerModelAdd);
    expect(filled.modelsChanges).toEqual([[glm, { id: 'glm-5', reasoning: false, vision: false }]]);
    expect(filled.draftChanges).toEqual(['']);
  });

  test('模型行能力开关与移除按行接线到 onModelsChange', () => {
    const toggle = mountList({ models: [glm], draft: '' });
    const row = findElementProps(toggle.tree, (props) => typeof props['onToggle'] === 'function');
    (row['onToggle'] as (flag: 'reasoning' | 'vision') => void)('reasoning');
    expect(toggle.modelsChanges).toEqual([[{ ...glm, reasoning: false }]]);

    const remove = mountList({ models: [glm], draft: '' });
    const removeRow = findElementProps(remove.tree, (props) => typeof props['onRemove'] === 'function');
    (removeRow['onRemove'] as () => void)();
    expect(remove.modelsChanges).toEqual([[]]);
  });

  test('空清单渲染空态文案，有模型时不渲染', () => {
    expect(collectElementProps(mountList({ models: [], draft: '' }).tree).some((p) => p['children'] === copy.settings.providerModelsEmpty)).toBe(true);
    expect(collectElementProps(mountList({ models: [glm], draft: '' }).tree).some((p) => p['children'] === copy.settings.providerModelsEmpty)).toBe(false);
  });
});
