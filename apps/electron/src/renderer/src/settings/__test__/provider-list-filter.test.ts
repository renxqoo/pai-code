import { describe, expect, test } from 'bun:test';

import type { ProviderConfigView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { filterProviders, providerListEmptyMessage } from '../provider-list-filter';

const zhipu: ProviderConfigView = {
  name: 'zhipu',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  api: 'openai-completions',
  models: [{ id: 'glm-4.6', reasoning: true, vision: false }],
  thinkingFormat: 'default',
  hasKey: true,
};

const anthropic: ProviderConfigView = {
  name: 'claude',
  baseUrl: 'https://api.anthropic.com',
  api: 'anthropic-messages',
  models: [{ id: 'claude-sonnet-4', reasoning: false, vision: true }],
  thinkingFormat: 'default',
  hasKey: false,
};

describe('渠道列表过滤', () => {
  test('空查询（含纯空白）全通过', () => {
    expect(filterProviders([zhipu, anthropic], '')).toEqual([zhipu, anthropic]);
    expect(filterProviders([zhipu, anthropic], '  ')).toEqual([zhipu, anthropic]);
  });

  test('匹配名称 / 地址 / 模型 id，大小写不敏感', () => {
    expect(filterProviders([zhipu, anthropic], 'ZHI')).toEqual([zhipu]);
    expect(filterProviders([zhipu, anthropic], 'bigmodel')).toEqual([zhipu]);
    expect(filterProviders([zhipu, anthropic], 'sonnet')).toEqual([anthropic]);
    expect(filterProviders([zhipu, anthropic], 'missing')).toEqual([]);
  });

  test('空态文案：无渠道 / 无匹配 / 有内容（null）', () => {
    expect(providerListEmptyMessage(0, 0)).toBe(copy.settings.providersEmpty);
    expect(providerListEmptyMessage(2, 0)).toBe(copy.settings.searchNoResults);
    expect(providerListEmptyMessage(2, 2)).toBeNull();
  });
});
