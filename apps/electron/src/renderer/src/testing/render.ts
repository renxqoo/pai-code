import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installDom } from './dom';

/**
 * 客户端渲染测试夹具：createRoot + act 渲染/更新/卸载。
 * 组件订阅模块级 store（uiStore/live store）时，种子经 store.setState 在
 * render 前落下（客户端路径读 getState，不经 SSR 初始快照）。
 */

export type RenderHandle = {
  container: HTMLElement
  root: Root
  rerender: (next: React.ReactElement) => void
  unmount: () => void
}

export function render(element: React.ReactElement): RenderHandle {
  installDom();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const renderElement = (next: React.ReactElement): void => {
    React.act(() => {
      root.render(next);
    });
  };
  renderElement(element);
  return {
    container,
    root,
    rerender: renderElement,
    unmount: () => {
      React.act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** 渲染计数探针：包在任意子树里数「实际执行了渲染体」的次数（重渲边界回归用）。 */
export function renderProbe(id: string): { Probe: React.FC; count: () => number; reset: () => void } {
  let renders = 0;
  const Probe = React.memo(function Probe(): null {
    renders += 1;
    return null;
  });
  Probe.displayName = `RenderProbe(${id})`;
  return { Probe, count: () => renders, reset: () => { renders = 0; } };
}
