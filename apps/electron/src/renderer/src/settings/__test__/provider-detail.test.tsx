import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProviderConfigView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { ProviderDetail } from '../provider-detail';

/** 渲染冒烟：编辑态 chrome（面包屑/标题/测试连接）与新建态无测试入口。 */
const ok = (): Promise<boolean> => Promise.resolve(true);
const noop = (): void => undefined;

const zhipu: ProviderConfigView = {
  name: 'zhipu',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  api: 'openai-completions',
  models: [{ id: 'glm-4.6', reasoning: true, vision: false }],
 
  hasKey: true,
};

function render(provider: ProviderConfigView | null): string {
  return renderToStaticMarkup(<ProviderDetail provider={provider} onUpsert={ok} onTest={() => Promise.resolve({ ok: true, latencyMs: 1 })} onBack={noop} onSaved={noop} />);
}

describe('渠道详情渲染冒烟', () => {
  test('编辑态：面包屑（返回 + 名称）、编辑标题与副标题、测试连接按钮', () => {
    const html = render(zhipu);
    expect(html).toContain(copy.settings.providerBackToList);
    expect(html).toContain('zhipu');
    expect(html).toContain(copy.settings.providerFormTitleEdit);
    expect(html).toContain(copy.settings.providerFormSubtitleEdit);
    expect(html).toContain(copy.settings.testConnection);
    expect(html).not.toContain(copy.settings.testing);
  });

  test('新建态：标题为新建渠道，无测试连接入口（尚未落盘无从探活）', () => {
    const html = render(null);
    expect(html).toContain(copy.settings.providerFormTitleNew);
    expect(html).toContain(copy.settings.providerFormSubtitleNew);
    expect(html).not.toContain(copy.settings.testConnection);
  });
});
