import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as renderStatic } from 'react-dom/server';
import * as React from 'react';

import { DevicesSection } from '../devices-section';

function state(over: Partial<Parameters<typeof DevicesSection>[0]['state']> = {}): Parameters<typeof DevicesSection>[0]['state'] {
  return {
    enabled: true,
    pairCode: null,
    lockedUntil: 0,
    devices: [],
    pairedCount: 0,
    ...over,
  };
}

function renderWith(over: Partial<Parameters<typeof DevicesSection>[0]> = {}): string {
  const props: Parameters<typeof DevicesSection>[0] = {
    state: state(),
    loading: false,
    onRefresh: () => undefined,
    onToggle: () => undefined,
    onGenerateCode: () => undefined,
    onRevoke: () => undefined,
    ...over,
  };
  return renderStatic(<DevicesSection {...props} />);
}

describe('DevicesSection（T57 桌面设备页）', () => {
  test('连接开启 + 无配对码：显示生成按钮与网络提示', () => {
    const html = renderWith();
    expect(html).toContain('配对新手机');
    expect(html).toContain('生成配对码');
  });

  test('配对码在屏：三三分组显示 + 剩余分钟', () => {
    const html = renderWith({ state: state({ pairCode: { code: '123456', expiresAt: Date.now() + 3 * 60_000 } }) });
    expect(html).toContain('123 456');
    expect(html).toContain('分钟后过期');
    expect(html).toContain('换一个');
  });

  test('已连接设备列表渲染设备名', () => {
    const html = renderWith({ state: state({ devices: ['iPhone 15 · Pai Code'] }) });
    expect(html).toContain('iPhone 15 · Pai Code');
    expect(html).toContain('已连接');
    expect(html).toContain('撤销');
  });

  test('锁定态：生成禁用（按钮 disabled）+ 锁定文案', () => {
    const html = renderWith({ state: state({ lockedUntil: Date.now() + 60_000 }) });
    expect(html).toContain('尝试次数过多');
    expect(html).toContain('disabled');
  });

  test('连接关闭：停用提示替代配对面（不渲染生成按钮）', () => {
    const html = renderWith({ state: state({ enabled: false }) });
    expect(html).toContain('手机连接已关闭');
    expect(html).not.toContain('生成配对码');
  });

  test('无设备时空态文案', () => {
    const html = renderWith();
    expect(html).toContain('暂无手机连接');
    expect(html).toContain('暂无已配对设备');
  });
});
