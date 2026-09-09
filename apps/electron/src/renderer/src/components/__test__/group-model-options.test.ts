import { describe, expect, test } from 'bun:test';

import { groupModelOptions } from '../group-model-options';

describe('groupModelOptions 模型目录分组', () => {
  test('表驱动：按首个 "/" 前缀分桶，桶序 = 首现序，label 去前缀、id 保完整', () => {
    expect(groupModelOptions(['openai/gpt-4o', 'anthropic/claude', 'openai/gpt-4o-mini'])).toEqual([
      {
        heading: 'openai',
        items: [
          { id: 'openai/gpt-4o', label: 'gpt-4o' },
          { id: 'openai/gpt-4o-mini', label: 'gpt-4o-mini' },
        ],
      },
      { heading: 'anthropic', items: [{ id: 'anthropic/claude', label: 'claude' }] },
    ]);
  });

  test('modelId 内含 "/"：只按首个 "/" 切分，其余留在 label', () => {
    expect(groupModelOptions(['openai/gpt/4o-preview'])).toEqual([
      { heading: 'openai', items: [{ id: 'openai/gpt/4o-preview', label: 'gpt/4o-preview' }] },
    ]);
  });

  test('无前缀条目并入同一无标题桶；全列表无前缀时输出单一无标题组', () => {
    expect(groupModelOptions(['bare-a', 'bare-b'])).toEqual([
      {
        heading: undefined,
        items: [
          { id: 'bare-a', label: 'bare-a' },
          { id: 'bare-b', label: 'bare-b' },
        ],
      },
    ]);
  });

  test('混合（有前缀 + 无前缀共存）：无标题桶按其首条目首现序落位', () => {
    expect(groupModelOptions(['openai/gpt-4o', 'bare', 'anthropic/claude', 'bare-2'])).toEqual([
      { heading: 'openai', items: [{ id: 'openai/gpt-4o', label: 'gpt-4o' }] },
      {
        heading: undefined,
        items: [
          { id: 'bare', label: 'bare' },
          { id: 'bare-2', label: 'bare-2' },
        ],
      },
      { heading: 'anthropic', items: [{ id: 'anthropic/claude', label: 'claude' }] },
    ]);
  });

  test('空输入返回 []', () => {
    expect(groupModelOptions([])).toEqual([]);
  });
});
