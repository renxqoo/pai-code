import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useObservedHeight } from '../use-observed-height';
import { render } from '@/testing/render';
import { installDom } from '@/testing/dom';

class StubObserver {
  observed: HTMLElement[] = [];
  disconnected = false;
  observe(target: HTMLElement): void {
    this.observed.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

/** 可控 ResizeObserver 桩：记录实例与观测目标（happy-dom 自带桩不派发，手动可查）。 */
function stubResizeObserver(): { instances: StubObserver[]; restore: () => void } {
  const instances: StubObserver[] = [];
  const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class Capturing extends StubObserver {
    constructor() {
      super();
      instances.push(this);
    }
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = Capturing as never;
  return {
    instances,
    restore: (): void => {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    },
  };
}

function Host({ height, onHeight }: { height: number; onHeight: (value: number) => void }): React.JSX.Element {
  const observe = useObservedHeight<HTMLDivElement>(onHeight);
  return (
    <div
      ref={(element) => {
        if (element !== null) element.getBoundingClientRect = () => ({ height } as DOMRect);
        return observe(element);
      }}
      data-testid="measured"
    />
  );
}

describe('useObservedHeight', () => {
  test('症状回归「避让高度冻结在初始值」：挂载即测一次；元素重挂即换绑新观测并断开旧观测', () => {
    installDom(); // 先装 dom：GlobalRegistrator 会覆写全局 ResizeObserver，桩必须在其后落
    const stub = stubResizeObserver();
    try {
      const reported: number[] = [];
      const onHeight = (value: number): void => {
        reported.push(value);
      };

      const view = render(<Host height={160} onHeight={onHeight} />);
      expect(reported).toEqual([160]);
      expect(stub.instances).toHaveLength(1);
      expect(stub.instances[0]?.observed).toHaveLength(1);
      expect(stub.instances[0]?.disconnected).toBe(false);

      // 条件挂载往返：key 变更模拟 overlay 卸载重挂（新元素、新高度、更高浮层）
      view.rerender(<Host key="second" height={230} onHeight={onHeight} />);
      expect(reported[reported.length - 1]).toBe(230);
      expect(stub.instances.length).toBe(2);
      expect(stub.instances[0]?.disconnected).toBe(true);
      expect(stub.instances[1]?.disconnected).toBe(false);
      expect(stub.instances[1]?.observed).toHaveLength(1);
      view.unmount();
      expect(stub.instances[1]?.disconnected).toBe(true);
    } finally {
      stub.restore();
    }
  });
});
