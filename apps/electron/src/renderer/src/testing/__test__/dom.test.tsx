import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { installDom } from '../dom';
import { render, renderProbe } from '../render';

/** 客户端渲染装置自检：DOM 注册幂等、act 渲染/更新/卸载、探针计数。 */
describe('testing 装置', () => {
  test('installDom 幂等（重复调用不重复注册）', () => {
    installDom();
    installDom();
    expect(typeof document).toBe('object');
  });

  test('render：渲染、rerender、unmount 全链', () => {
    const view = render(<p>hello</p>);
    expect(view.container.textContent).toBe('hello');
    view.rerender(<p>world</p>);
    expect(view.container.textContent).toBe('world');
    view.unmount();
    expect(view.container.isConnected).toBe(false);
  });

  test('renderProbe：只数渲染体执行次数', () => {
    const probe = renderProbe('t');
    const view = render(
      <>
        <probe.Probe />
      </>,
    );
    expect(probe.count()).toBe(1);
    view.rerender(
      <>
        <probe.Probe />
      </>,
    );
    expect(probe.count()).toBe(2);
    probe.reset();
    expect(probe.count()).toBe(0);
    view.unmount();
  });
});
