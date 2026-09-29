import { beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import { DevicesSection } from '../devices-section';

/** preload gateway 面桩（组件只经 window.pai.gateway）。 */
function stubGateway(over: { status?: unknown; command?: unknown } = {}): void {
  (globalThis as unknown as { window?: unknown }).window = {
    pai: {
      gateway: {
        status: over.status ?? (() => Promise.resolve({ process: 'running', connected: true, staleSocket: false })),
        command: over.command ?? (() => Promise.resolve({ ok: true, body: {} })),
      },
    },
  };
}

function render(): string {
  return renderToStaticMarkup(React.createElement(DevicesSection));
}

describe('DevicesSection（remote-access owner 面板）', () => {
  beforeEach(() => {
    stubGateway();
  });

  test('网关面缺失（浏览器直开）渲染引导卡不崩', () => {
    (globalThis as unknown as { window?: unknown }).window = { pai: {} };
    const html = render();
    expect(html).toContain('网关不可用');
  });

  test('默认渲染：网关状态/发起配对/已配对设备三卡', () => {
    const html = render();
    expect(html).toContain('配对新手机');
    expect(html).toContain('发起配对');
    expect(html).toContain('已配对设备');
    expect(html).toContain('暂无已配对设备');
  });

  test('档位选择器三档齐全', () => {
    const html = render();
    expect(html).toContain('只读');
    expect(html).toContain('可交互');
    expect(html).toContain('全权');
  });
});
