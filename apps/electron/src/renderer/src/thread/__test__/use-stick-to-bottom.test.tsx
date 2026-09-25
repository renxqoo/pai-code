import { beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useStickToBottom } from '../use-stick-to-bottom';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

/**
 * 贴底跟随回归：内容增长的重钉不依赖舞台重渲（折叠展开/图片加载是局部
 * state/DOM 变化）——ResizeObserver 必须观测内容列；程序平滑滚动的中间帧
 * 不等价于用户让位；reduced-motion 降级直接定位（与轮次锚点跳转同约定）。
 * 让位判读走滚动增量方向：上行增量（滚轮/拖拽/键盘）立即让位且不被位置
 * 死区重武装，流式期小步上翻不被拽回；下滚回到底部附近才恢复跟随。
 * happy-dom 无真实排版：滚动几何以实例 defineProperty 桩出（先 installDom
 * 再打桩，scrollTop 钳制到 [0, scrollHeight - clientHeight] 与浏览器一致），
 * ResizeObserver 以捕获桩手动触发（对应真实浏览器的内容盒变化）。
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
      // 浏览器语义：scrollTop 钳制在 [0, scrollHeight - clientHeight]
      scrollTop = Math.min(Math.max(value, 0), Math.max(0, height - viewport));
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

function fireObservers(): void {
  for (const observer of CapturingObserver.instances) observer.callback();
}

function scrollOf(scroller: HTMLDivElement): void {
  scroller.dispatchEvent(new Event('scroll'));
}

function wheelUp(scroller: HTMLDivElement, deltaY: number): void {
  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY }));
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
      fireObservers();
      expect(geo.scrollTop).toBe(500);
      geo.grow(300);
      fireObservers();
      expect(geo.scrollTop).toBe(800);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「流式中点回底浮标到不了底」：程序平滑滚动的中间帧不清跟随意图，后续内容增长重钉到当前底部', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      // 用户先上翻离开底部
      scroller.scrollTop = 0;
      React.act(() => {
        scrollOf(scroller);
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
        scrollOf(scroller);
      });
      expect(scroller.getAttribute('data-at-bottom')).toBe('true');

      // 流式增量到达（内容长高，观测回调触发）：贴底重钉到当前底部
      geo.grow(600);
      React.act(() => {
        fireObservers();
      });
      expect(geo.scrollTop).toBe(1_100);
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
        scrollOf(scroller);
      });
      const scrollToCalls: unknown[] = [];
      scroller.scrollTo = ((options: unknown) => {
        scrollToCalls.push(options);
      }) as typeof scroller.scrollTo;
      React.act(() => {
        (scroller.querySelector('[data-testid="jump"]') as HTMLButtonElement).click();
      });
      expect(scrollToCalls).toEqual([]);
      expect(scroller.scrollTop).toBe(500);
      view.unmount();
    } finally {
      windowStub.matchMedia = original;
      restoreObserver();
    }
  });

  test('症状回归「流式中上翻被拽回」：48px 死区内小步上翻即让位，内容增长/重渲不钉回底部', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      fireObservers();
      expect(geo.scrollTop).toBe(500);

      // 滚轮上翻 20px（48px 死区内）：旧实现被「近底」重武装后增长钉回底部
      wheelUp(scroller, -20);
      scroller.scrollTop = 480;
      React.act(() => {
        scrollOf(scroller);
      });
      geo.grow(300);
      React.act(() => {
        fireObservers();
        view.rerender(<Host />);
      });
      expect(geo.scrollTop).toBe(480);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「上翻读历史被拉回」：让位后持续流式增长/重渲，阅读位置不动、浮标亮起', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      fireObservers();

      // 上翻到历史中部（滚轮大步 + 滚动落帧）
      wheelUp(scroller, -1_000);
      scroller.scrollTop = 0;
      React.act(() => {
        scrollOf(scroller);
      });
      // 持续流式：增长 ×2 + 重渲 ×2，阅读位置分毫不动
      geo.grow(500);
      React.act(() => {
        fireObservers();
        view.rerender(<Host />);
      });
      geo.grow(500);
      React.act(() => {
        fireObservers();
        view.rerender(<Host />);
      });
      expect(geo.scrollTop).toBe(0);
      expect(scroller.getAttribute('data-at-bottom')).toBe('false');
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('拖拽/键盘上翻同样让位（scroll-only 路径无 wheel 事件）：增长不钉底', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      fireObservers();

      // 拖滚动条/方向键上翻：只有滚动事件（增量为负）
      scroller.scrollTop = 200;
      React.act(() => {
        scrollOf(scroller);
      });
      geo.grow(400);
      React.act(() => {
        fireObservers();
        view.rerender(<Host />);
      });
      expect(geo.scrollTop).toBe(200);
      expect(scroller.getAttribute('data-at-bottom')).toBe('false');
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('下滚回到底部附近恢复跟随：内容增长重新贴底', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host />);
      const scroller = scrollerOf(view.container);
      const geo = stubScrollGeometry(scroller, 1_000, 500);
      fireObservers();

      // 先上翻让位
      wheelUp(scroller, -1_000);
      scroller.scrollTop = 0;
      React.act(() => {
        scrollOf(scroller);
      });
      // 下滚回到近底（10px 死区内）：恢复跟随
      scroller.scrollTop = 490;
      React.act(() => {
        scrollOf(scroller);
      });
      geo.grow(200);
      React.act(() => {
        fireObservers();
      });
      expect(geo.scrollTop).toBe(700);
      expect(scroller.getAttribute('data-at-bottom')).toBe('true');
      view.unmount();
    } finally {
      restoreObserver();
    }
  });
});
