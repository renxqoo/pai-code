import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProviderConfigView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { ProviderEditor } from '../provider-editor';

/**
 * 渲染冒烟：字段齐全、预填、思考形态门控与 key 状态。
 * 交互（输入/切换/保存）依赖真机走查；提交归一由 provider-editor-submit 覆盖。
 */
const ok = (): Promise<boolean> => Promise.resolve(true);
const noop = (): void => undefined;

const claude: ProviderConfigView = {
  name: 'claude',
  baseUrl: 'https://api.anthropic.com',
  api: 'anthropic-messages',
  models: [{ id: 'claude-sonnet-4', reasoning: true, vision: true }],
  thinkingFormat: 'default',
  hasKey: true,
};

describe('渠道编辑器渲染冒烟', () => {
  test('新建态：四个字段 + 默认 OpenAI 兼容格式 + 思考形态字段 + 保存按钮，无 key pill 与取消', () => {
    const html = renderToStaticMarkup(<ProviderEditor initial={null} onSubmit={ok} />);
    expect(html).toContain(copy.settings.providerFieldName);
    expect(html).toContain(copy.settings.providerFieldBaseUrl);
    expect(html).toContain(copy.settings.providerFieldApi);
    expect(html).toContain(copy.settings.apiFormatOptions['openai-completions']);
    expect(html).toContain(copy.settings.thinkingFormatHint);
    expect(html).toContain(copy.settings.providerFieldKey);
    expect(html).toContain(copy.settings.providerModelsLabel);
    expect(html).toContain(copy.settings.providerModelsEmpty);
    expect(html).toContain(copy.settings.save);
    expect(html).not.toContain(copy.settings.keyPresent);
    expect(html).not.toContain(copy.settings.providerKeyClear);
    expect(html).not.toContain(copy.settings.cancelEdit);
  });

  test('编辑态：预填并锁定名称、隐藏思考形态、key pill 与清除入口、取消按钮', () => {
    const html = renderToStaticMarkup(<ProviderEditor initial={claude} onSubmit={ok} onCancel={noop} onSaved={noop} />);
    expect(html).toContain('value="claude"');
    expect(html).toContain('value="https://api.anthropic.com"');
    expect(html).toContain('disabled=""');
    expect(html).toContain(copy.settings.apiFormatOptions['anthropic-messages']);
    expect(html).not.toContain(copy.settings.thinkingFormatHint);
    expect(html).toContain(copy.settings.keyPresent);
    expect(html).toContain(copy.settings.providerKeyClear);
    expect(html).toContain('claude-sonnet-4');
    expect(html).toContain(copy.settings.cancelEdit);
    expect(html).not.toContain(copy.settings.providerModelsEmpty);
  });

  test('词表外 api（磁盘手写格式）：触发器显示自定义回退文案', () => {
    const html = renderToStaticMarkup(<ProviderEditor initial={{ ...claude, api: 'azure-openai-responses' }} onSubmit={ok} />);
    expect(html).toContain(copy.settings.apiFormatUnknown('azure-openai-responses'));
  });
});
