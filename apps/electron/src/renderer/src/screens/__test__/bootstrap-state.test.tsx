import { afterEach, describe, expect, test } from 'bun:test';

import { render } from '@/testing/render';

import { bridgeClient, store } from '@/live/workspace-runtime';

import { BootstrapState } from '../bootstrap-state';

/** 启动守卫页面：启动态纯 logo + 水波纹（无文案），失败态必须保留排障指引。 */

const originalAvailable = bridgeClient.available;
const originalBootstrapError = store.getState().bootstrapError;
const originalHostPhase = store.getState().hostPhase;

afterEach(() => {
  Object.defineProperty(bridgeClient, 'available', { value: originalAvailable, configurable: true });
  store.setState({ bootstrapError: originalBootstrapError, hostPhase: originalHostPhase });
});

function setAvailable(value: boolean): void {
  Object.defineProperty(bridgeClient, 'available', { value, configurable: true });
}

describe('启动守卫 BootstrapState', () => {
  test('启动态（桥可用 + 无错误）：只渲染 logo 水波纹，不出任何启动文案', () => {
    setAvailable(true);
    store.setState({ bootstrapError: null, hostPhase: 'starting' });
    const view = render(<BootstrapState />);
    expect(view.container.querySelector('.logo-ripple-stage')).not.toBeNull();
    expect(view.container.textContent?.trim()).toBe('');
    view.unmount();
  });

  test('症状回归：桥不可用不得停在纯 logo（白屏无指引）——必须出失败标题与排障文案', () => {
    setAvailable(false);
    store.setState({ bootstrapError: null, hostPhase: null });
    const view = render(<BootstrapState />);
    expect(view.container.textContent).toContain('无法启动');
    expect(view.container.textContent).toContain('预加载桥');
    view.unmount();
  });

  test('bootstrap 失败（桥可用）同样进失败态并给指引', () => {
    setAvailable(true);
    store.setState({ bootstrapError: 'boom', hostPhase: null });
    const view = render(<BootstrapState />);
    expect(view.container.querySelector('.logo-ripple-stage')).toBeNull();
    expect(view.container.textContent).toContain('无法启动');
    view.unmount();
  });

  test('宿主启动失败：追加 host-hub 排障指引', () => {
    setAvailable(true);
    store.setState({ bootstrapError: 'boom', hostPhase: 'failed' });
    const view = render(<BootstrapState />);
    expect(view.container.textContent).toContain('host-hub');
    view.unmount();
  });
});
