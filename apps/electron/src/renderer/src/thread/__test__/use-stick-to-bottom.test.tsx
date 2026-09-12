import { beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useStickToBottom } from '../use-stick-to-bottom';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

/**
 * 贴底跟随回归：内容增长的重钉不依赖舞台重渲（折叠展开/图片加载是局部
 * state/DOM 变化）——ResizeObserver 必须观测内容列；程序平滑滚动的中间帧
 * 不等价于用户让位；reduced-motion 降级直接定位（与轮次锚点跳转同约定）。
 * happy-dom 无真实排版：滚动几何以实例 defineProperty 桩出（先 installDom
 * 再打桩），ResizeObserver 以捕获桩手动触发（对应真实浏览器的内容盒变化）。
 */

class CapturingObserver {
  static readonly instances: CapturingObserver[] = [];
  readonly targets: Element[] = [];
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    CapturingObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    this.targets.length = 0;
  }
}

function stubResizeObserver(): () => void {
  CapturingObserver.instances.length = 0;
  const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = CapturingObserver as never;
  return () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
  };
}

function stubScrollGeometry(element: HTMLElement, scrollHeight: number, clientHeight: number): { grow(delta: number): void; readonly scrollTop: number } {
  let scrollTop = 0;
  let height = scrollHeight;
  const viewport = clientHeight;
  Object.defineProperty(element, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
    configurable: true,
  });
  Object.defineProperty(element, 'scrollHeight', { get: () => height, configurable: true });
  Object.defineProperty(element, 'clientHeight', { get: () => viewport, configurable: true });
  return {
    grow(delta: number): void {
      height += delta;
    },
    get scrollTop(): number {
      return scrollTop;
    },
  };
}

function Host(): React.JSX.Element {
  const { containerRef, onScroll, scrollToBottom, atBottom } = useStickToBottom();
  return (
    <div ref={containerRef} onScroll={onScroll} data-testid="scroller" data-at-bottom={String(atBottom)}>
      <div data-testid="content" />
      <button type="button" onClick={scrollToBottom} data-testid="jump" />
    </div>
  );
}

function scrollerOf(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector('[data-testid="scroller"]');
  if (!(element instanceof HTMLDivElement)) throw new Error('scroller not found');
  return element;
}

beforeEach(() => {
  installDom();
});

describe('useStickToBottom', () => {
  test('症状回归「展开折叠轮次后内容滑入输入浮层下」：内容增长经内容列观测重钉（不依赖舞台重渲）', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      // 观测面必须包含内容列（首子元素），不只是滚动容器自身
      const targets = CapturingObserver.instances.flatMap((observer) => observer.targets);
      expect(targets).toContain(scroller.firstElementChild);

      // 贴底态下内容长高 300（折叠展开/图片加载形态）：观测回调触发即重钉
      CapturingObserver.instances[0]?.callback();
      expect(geo.scrollTop).toBe(1_000);
      geo.grow(300);
      for (const observer of CapturingObserver.instances) observer.callback();
      expect(geo.scrollTop).toBe(1_300);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「流式中点回底浮标到不了底」：程序平滑滚动的中间帧不清跟随意图，后续渲染重钉到当前底部', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      // 用户先上翻离开底部
      scroller.scrollTop = 0;
      React.act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
      expect(scroller.getAttribute('data-at-bottom')).toBe('false');

      // scrollTo 桩：记录参数、不位移（模拟 smooth 动画在途）
      const scrollToCalls: Array<{ top: number; behavior: string }> = [];
      scroller.scrollTo = ((options: { top: number; behavior: string }) => {
        scrollToCalls.push(options);
      }) as typeof scroller.scrollTo;
      React.act(() => {
        (scroller.querySelector('[data-testid="jump"]') as HTMLButtonElement).click();
      });
      expect(scrollToCalls).toEqual([{ top: 1_000, behavior: 'smooth' }]);

      // 动画中间帧（距底尚远）不得清掉跟随
      scroller.scrollTop = 300;
      React.act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
      expect(scroller.getAttribute('data-at-bottom')).toBe('true');

      // 流式增量到达（内容长高 + 渲染）：贴底 effect 重钉到当前底部
      geo.grow(600);
      view.rerender(<Host />);
      expect(geo.scrollTop).toBe(1_600);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「reduced-motion 仍整页平滑滚动」：回底降级为直接定位', () => {
    const restoreObserver = stubResizeObserver();
    const windowStub = window as unknown as { matchMedia: (query: string) => { matches: boolean } };
    const original = windowStub.matchMedia;
    windowStub.matchMedia = (query: string): { matches: boolean } => ({ matches: query.includes('prefers-reduced-motion') });
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      stubScrollGeometry(scroller, 1_000, 500);
      scroller.scrollTop = 0;
      React.act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
      const scrollToCalls: unknown[] = [];
      scroller.scrollTo = ((options: unknown) => {
        scrollToCalls.push(options);
      }) as typeof scroller.scrollTo;
      React.act(() => {
        (scroller.querySelector('[data-testid="jump"]') as HTMLButtonElement).click();
      });
      expect(scrollToCalls).toEqual([]);
      expect(scroller.scrollTop).toBe(1_000);
      view.unmount();
    } finally {
      windowStub.matchMedia = original;
      restoreObserver();
    }
  });
});
