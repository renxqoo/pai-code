import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProviderConfigView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { ProvidersSection } from '../providers-section';

/** 渲染冒烟：默认模型卡 + 渠道列表（空态/渠道卡/失效默认模型标记）。钻入详情与删除交互依赖真机走查。 */
const ok = (): Promise<boolean> => Promise.resolve(true);
const noop = (): void => undefined;

const zhipu: ProviderConfigView = {
  name: 'zhipu',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  api: 'openai-completions',
  models: [
    { id: 'glm-4.6', reasoning: true, vision: false },
    { id: 'glm-5', reasoning: false, vision: false },
  ],
  thinkingFormat: 'default',
  hasKey: true,
};

const claude: ProviderConfigView = {
  name: 'claude',
  baseUrl: 'https://api.anthropic.com',
  api: 'anthropic-messages',
  models: [{ id: 'claude-sonnet-4', reasoning: false, vision: true }],
  thinkingFormat: 'default',
  hasKey: false,
};

function render(list: readonly ProviderConfigView[], defaultModel: string | null, modelOptions: readonly string[]): string {
  return renderToStaticMarkup(
    <ProvidersSection
      list={list}
      defaultModel={defaultModel}
      modelOptions={modelOptions}
      onUpsert={ok}
      onRemove={ok}
      onSelectDefaultModel={noop}
      onTest={() => Promise.resolve({ ok: true, latencyMs: 1 })}
    />,
  );
}

describe('渠道分区渲染冒烟', () => {
  test('空列表：空态文案 + 0 个渠道 + 添加渠道按钮', () => {
    const html = render([], null, []);
    expect(html).toContain(copy.settings.providersTitle);
    expect(html).toContain(copy.settings.providersDesc);
    expect(html).toContain(copy.settings.providersCount(0));
    expect(html).toContain(copy.settings.providersEmpty);
    expect(html).toContain(copy.settings.addProvider);
    expect(html).toContain(copy.settings.defaultModelTitle);
  });

  test('渠道卡：名称 + key 状态 + 地址 + API 格式与模型数摘要', () => {
    const html = render([zhipu, claude], null, []);
    expect(html).toContain(copy.settings.providersCount(2));
    expect(html).toContain('zhipu');
    expect(html).toContain(copy.settings.providerMeta(copy.settings.apiFormatOptions['openai-completions'], 2));
    expect(html).toContain(copy.settings.providerMeta(copy.settings.apiFormatOptions['anthropic-messages'], 1));
    expect(html).toContain(copy.settings.keyPresent);
    expect(html).toContain(copy.settings.keyMissing);
    expect(html).toContain('https://api.anthropic.com');
    expect(html).not.toContain(copy.settings.providersEmpty);
  });

  test('默认模型有效：触发器显示值，无失效标记', () => {
    const html = render([zhipu], 'zhipu/glm-4.6', ['zhipu/glm-4.6']);
    expect(html).toContain('zhipu/glm-4.6');
    expect(html).not.toContain(copy.settings.defaultModelInvalidShort);
    expect(html).not.toContain(copy.settings.generalDefaultModelInvalid);
  });

  test('默认模型已不在目录（渠道被删/改名）：短标记 + 内联失效提示', () => {
    const html = render([zhipu], 'claude/claude-sonnet-4', ['zhipu/glm-4.6']);
    expect(html).toContain(copy.settings.defaultModelInvalidShort);
    expect(html).toContain(copy.settings.generalDefaultModelInvalid);
  });
});
