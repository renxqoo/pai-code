import { beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { anchorIndexAtTops, useCurrentAnchorIndex } from '../use-current-anchor-index';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

/**
 * 当前阅读轮判定（T55 窗口中心）：最后越过判读线（视口顶 + 跳转落点 scroll-mt，含
 * 0.5px 容差）的锚点即当前；缺失/脱离文档 section（+∞ 哨兵）不参与判定；贴底
 * （含尾部短轮链压不满线）恒认末锚点。hook 挂滚动容器：滚动推进下标、下标不变
 * 不重渲、锚点集内容不变不换身份（流式期不重建监听——churn 回归）、几何变化
 * （ResizeObserver）重测、卸载拆除监听（无泄漏）。happy-dom 无排版：section 顶边
 * 以 defineProperty 桩出（挂载后落桩，靠滚动/观测回调触发重测）；未桩 section
 * 零几何（top=0 压线命中），用例必须逐个落桩避免假绿。
 */

/** ResizeObserver 捕获桩（happy-dom 无 RO/无布局）：手动触发对应真实浏览器的盒变化。 */
class CapturingObserver {
  static readonly instances: CapturingObserver[] = [];
  readonly targets: Element[] = [];
  alive = true;
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    CapturingObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    this.alive = false;
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

function fireObservers(): void {
  for (const observer of CapturingObserver.instances) if (observer.alive) observer.callback();
}

/** scroll 监听 add/remove 计数（churn 回归）：只数挂到 scroller 的（React 根监听也叫
 *  'scroll'，按注册目标过滤）。happy-dom 的 addEventListener 不定挂在
 *  EventTarget.prototype（可能在 Node 等中间原型）：沿元素原型链找到持有者再包裹，
 *  防 spy 打空假绿。 */
function spyScrollListeners(): { added: () => number; removed: () => number; restore: () => void } {
  let added = 0;
  let removed = 0;
  const isScroller = (value: unknown): boolean =>
    value instanceof HTMLElement && value.getAttribute('data-testid') === 'scroller';
  let holder: object | null = Object.getPrototypeOf(document.createElement('div'));
  while (holder !== null && !Object.prototype.hasOwnProperty.call(holder, 'addEventListener')) {
    holder = Object.getPrototypeOf(holder);
  }
  if (holder === null) throw new Error('addEventListener owner prototype not found');
  const target = holder as { addEventListener: unknown; removeEventListener: unknown };
  const originalAdd = target.addEventListener;
  const originalRemove = target.removeEventListener;
  target.addEventListener = function (this: EventTarget, ...args: unknown[]): void {
    if (args[0] === 'scroll' && isScroller(this)) added += 1;
    (originalAdd as unknown as (...rest: unknown[]) => void).apply(this, args);
  };
  target.removeEventListener = function (this: EventTarget, ...args: unknown[]): void {
    if (args[0] === 'scroll' && isScroller(this)) removed += 1;
    (originalRemove as unknown as (...rest: unknown[]) => void).apply(this, args);
  };
  return {
    added: () => added,
    removed: () => removed,
    restore: () => {
      target.addEventListener = originalAdd;
      target.removeEventListener = originalRemove;
    },
  };
}

describe('anchorIndexAtTops（当前轮纯判定）', () => {
  test('最后越过判读线的锚点当选（顺序扫描取最后一个）', () => {
    expect(anchorIndexAtTops([0, 50, 100, 150], 100)).toBe(2);
    expect(anchorIndexAtTops([0, 50, 100, 150], 50)).toBe(1);
    expect(anchorIndexAtTops([0, 50, 100, 150], -1)).toBe(0);
  });

  test('压线与容差内算命中（缩放/分数布局下落点 24±0.0x 不得恒偏一轮）', () => {
    expect(anchorIndexAtTops([-10, 24], 24)).toBe(1);
    expect(anchorIndexAtTops([24, 24.01], 24)).toBe(1);
    expect(anchorIndexAtTops([24, 24.6], 24)).toBe(0);
  });

  test('全部在线下（滚到最顶）降级 0', () => {
    expect(anchorIndexAtTops([100, 200, 300], 24)).toBe(0);
  });

  test('缺失 section 哨兵（+∞）与 NaN 跳过不参与判定', () => {
    expect(anchorIndexAtTops([0, Number.POSITIVE_INFINITY, 50], 40)).toBe(0);
    expect(anchorIndexAtTops([Number.NaN, 10, Number.POSITIVE_INFINITY], 40)).toBe(1);
  });

  test('空输入返回 0', () => {
    expect(anchorIndexAtTops([], 24)).toBe(0);
  });
});

type HostProps = {
  anchorIds: readonly string[]
  /** 实际渲染 section 的子集（默认全量）：造「锚点有 id 但 section 缺失」形态 */
  renderIds?: readonly string[]
  /** pin 按钮钉住的目标锚点 id（默认第三个） */
  pinTarget?: string
  onRender?: () => void
};

function Host({ anchorIds, renderIds, pinTarget, onRender }: HostProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { index, pinTurn } = useCurrentAnchorIndex(containerRef, anchorIds);
  onRender?.();
  return (
    <div ref={containerRef} data-testid="scroller">
      <span data-testid="index">{index}</span>
      <button type="button" data-testid="pin" onClick={() => pinTurn(pinTarget ?? anchorIds[2] ?? '')}>pin</button>
      {(renderIds ?? anchorIds).map((id) => (
        <section key={id} data-turn-id={id} />
      ))}
    </div>
  );
}

/** 桩 section 顶边（视口坐标）：按 turn id 逐个落下；未桩 section 保持零几何。 */
function stubTops(container: HTMLElement, tops: Readonly<Record<string, number>>): void {
  for (const [id, top] of Object.entries(tops)) {
    const section = container.querySelector(`[data-turn-id="${id}"]`);
    if (section === null) throw new Error(`section not found: ${id}`);
    Object.defineProperty(section, 'getBoundingClientRect', {
      value: () => ({ top, bottom: top + 400 }) as DOMRect,
      configurable: true,
    });
  }
}

/** 桩滚动几何（happy-dom 无排版）：必须打在 hook 挂载的 scroller 上，不是 render 外层容器。 */
function stubScroll(container: HTMLElement, scrollTop: number, scrollHeight: number, clientHeight: number): void {
  const scroller = scrollerOf(container);
  Object.defineProperty(scroller, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(scroller, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: clientHeight, configurable: true });
}

function indexOf(container: HTMLElement): number {
  const span = container.querySelector('[data-testid="index"]');
  if (span === null) throw new Error('index span not found');
  return Number(span.textContent);
}

function scrollerOf(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector('[data-testid="scroller"]');
  if (!(element instanceof HTMLDivElement)) throw new Error('scroller not found');
  return element;
}

function scrollTo(container: HTMLElement): void {
  React.act(() => {
    scrollerOf(container).dispatchEvent(new Event('scroll'));
  });
}

function dispatchScroller(container: HTMLElement, type: string): void {
  React.act(() => {
    scrollerOf(container).dispatchEvent(new Event(type));
  });
}

function pin(container: HTMLElement): void {
  React.act(() => {
    const button = container.querySelector('[data-testid="pin"]');
    if (!(button instanceof HTMLElement)) throw new Error('pin button not found');
    button.click();
  });
}

const IDS = ['a', 'b', 'c', 'd', 'e'] as const;

beforeEach(() => {
  installDom();
});

describe('useCurrentAnchorIndex（滚动驱动当前轮）', () => {
  test('滚动重测：最后越过判读线的锚点当选', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} />);
      stubTops(view.container, { a: -500, b: -200, c: 10, d: 400, e: 800 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('滚动推进下标：窗口中心随阅读位置滑动', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} />);
      stubTops(view.container, { a: 100, b: 200, c: 300, d: 400, e: 500 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(0);
      stubTops(view.container, { a: -900, b: -700, c: -500, d: -10, e: 300 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(3);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('下标不变的滚动不重渲（流式期滚动不击穿舞台）', () => {
    const restoreObserver = stubResizeObserver();
    try {
      let renders = 0;
      const probe = (): void => {
        renders += 1;
      };
      const view = render(<Host anchorIds={IDS} onRender={probe} />);
      stubTops(view.container, { a: -100, b: 10, c: 500, d: 900, e: 1300 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      const after = renders;
      stubTops(view.container, { a: -300, b: -100, c: 480, d: 880, e: 1280 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      expect(renders).toBe(after);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「流式期滚动卡顿」：锚点集内容不变（换引用）不重建监听，卸载即拆除', () => {
    const restoreObserver = stubResizeObserver();
    const spy = spyScrollListeners();
    try {
      const view = render(<Host anchorIds={IDS} />);
      expect(spy.added()).toBe(1);
      expect(spy.removed()).toBe(0);
      // 流式期 items 每事件换引用：同内容新数组不得拆挂监听
      view.rerender(<Host anchorIds={[...IDS]} />);
      view.rerender(<Host anchorIds={[...IDS]} />);
      expect(spy.added()).toBe(1);
      expect(spy.removed()).toBe(0);
      view.unmount();
      expect(spy.removed()).toBe(1);
    } finally {
      spy.restore();
      restoreObserver();
    }
  });

  test('症状回归「切会话后窗口中心停在旧会话」：锚点集变化换用新集判定', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={['x', 'y']} />);
      stubTops(view.container, { x: -10, y: 500 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(0);
      view.rerender(<Host anchorIds={['p', 'q', 'r']} />);
      // 新集 p/q/r 里 p/q 越线、r 未越线 → 1；若闭包仍用旧集（x/y 已卸载 → +∞）会恒 0
      stubTops(view.container, { p: -500, q: -100, r: 800 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('症状回归「尾部短轮链压不满判读线，正在读的尾轮不在窗口」：贴底即认末锚点', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} />);
      // 末 3 轮是短轮（顶边在视口下半，永不越线）；滚到底（scrollTop = maxScroll）时纯判定停在 b
      stubTops(view.container, { a: -2000, b: -600, c: 120, d: 200, e: 280 });
      stubScroll(view.container, 4_600, 5_000, 400);
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(4);
      // 离底 3px（超出贴底容差）：不得贴底钳制——几何判定给 d（3），钳制会给末条（4）
      stubScroll(view.container, 4_597, 5_000, 400);
      stubTops(view.container, { a: -2000, b: -600, c: -500, d: -400, e: 300 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(3);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('几何变化（折叠开合/图片加载）经 ResizeObserver 重测，不依赖滚动事件', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} />);
      stubTops(view.container, { a: -100, b: -50, c: 300, d: 700, e: 1100 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      // 上方轮次折叠 → 全体顶边上移（无滚动事件）
      stubTops(view.container, { a: -500, b: -450, c: -100, d: 300, e: 700 });
      React.act(() => {
        fireObservers();
      });
      expect(indexOf(view.container)).toBe(2);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('挂载即判定：零几何降级落末锚点（贴底阅读同向），缺失 section 不参与', () => {
    const restoreObserver = stubResizeObserver();
    try {
      // 'e' 不渲染 section（缺失 → +∞ 哨兵）；其余零几何压线 → 最后一个可达 = d
      const view = render(<Host anchorIds={IDS} renderIds={IDS.slice(0, 4)} />);
      expect(indexOf(view.container)).toBe(3);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('空锚点集不挂监听、恒 0；非空 → 空 → 非空不残留旧下标', () => {
    const restoreObserver = stubResizeObserver();
    const spy = spyScrollListeners();
    try {
      const view = render(<Host anchorIds={[]} />);
      expect(indexOf(view.container)).toBe(0);
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(0);
      expect(spy.added()).toBe(0);
      view.rerender(<Host anchorIds={IDS} />);
      stubTops(view.container, { a: -100, b: -50, c: 300, d: 700, e: 1100 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      // 换回空集（切到无历史会话）：旧下标必须归零，不得带给下个非空集首帧
      view.rerender(<Host anchorIds={[]} />);
      expect(indexOf(view.container)).toBe(0);
      view.unmount();
    } finally {
      spy.restore();
      restoreObserver();
    }
  });

  test('症状回归「点击跳转中刻痕逐帧换位闪抖、瞄准后跳错消息」：钉住后飞行中间帧窗口冻结', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} />);
      stubTops(view.container, { a: -500, b: -200, c: 10, d: 400, e: 800 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      pin(view.container); // 钉到 'c'（下标 2）
      // 飞行中间帧：几何随滚动推进但未收敛到目标 → 显示不动
      stubTops(view.container, { a: -100, b: 300, c: 700, d: 1100, e: 1500 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      stubTops(view.container, { a: -700, b: -300, c: 100, d: 500, e: 900 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      // 落定：几何收敛到目标 → 解除钉住，后续滚动恢复跟随
      stubTops(view.container, { a: -800, b: -400, c: -10, d: 390, e: 790 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      stubTops(view.container, { a: -1200, b: -800, c: -400, d: -10, e: 390 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(3);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });

  test('落定（scrollend）/ 用户接管（wheel、keydown）解除钉住，按当下几何恢复跟随', () => {
    const restoreObserver = stubResizeObserver();
    try {
      for (const releaseType of ['scrollend', 'wheel', 'keydown']) {
        const view = render(<Host anchorIds={IDS} />);
        stubTops(view.container, { a: -500, b: -200, c: 10, d: 400, e: 800 });
        scrollTo(view.container);
        pin(view.container);
        // 飞行中几何推进到非目标（d 已越线）→ 冻结不推进
        stubTops(view.container, { a: -900, b: -500, c: -200, d: -100, e: 300 });
        scrollTo(view.container);
        expect(indexOf(view.container)).toBe(2);
        dispatchScroller(view.container, releaseType);
        // 解除后按当下几何走（最后越线是 d）→ 3
        expect(indexOf(view.container)).toBe(3);
        view.unmount();
      }
    } finally {
      restoreObserver();
    }
  });

  test('钉到未知锚点 id 不生效（垃圾输入降级）：滚动正常跟随不冻结', () => {
    const restoreObserver = stubResizeObserver();
    try {
      const view = render(<Host anchorIds={IDS} pinTarget="nope" />);
      pin(view.container);
      stubTops(view.container, { a: -100, b: -50, c: 300, d: 700, e: 1100 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(1);
      stubTops(view.container, { a: -500, b: -450, c: -100, d: 300, e: 700 });
      scrollTo(view.container);
      expect(indexOf(view.container)).toBe(2);
      view.unmount();
    } finally {
      restoreObserver();
    }
  });
});
