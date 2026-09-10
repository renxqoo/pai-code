import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { useSidebarResize } from '../use-sidebar-resize';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';

/** 拖拽状态机纯函数已有单测；此处测 React 绑定层——事件进、宽度写回 ui store、钳制生效。 */

type ResizeHarness = { width: number; dragging: boolean };

function SeparatorHarness({ onState }: { onState: (state: ResizeHarness) => void }): React.JSX.Element {
  const { width, dragging, separators } = useSidebarResize(SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  onState({ width, dragging });
  return (
    <div
      role="separator"
      tabIndex={0}
      data-width={width}
      {...separators}
    />
  );
}

describe('useSidebarResize 绑定层', () => {
  beforeEach(() => uiStore.getState().reset());
  afterEach(() => uiStore.getState().reset());

  function fire(el: HTMLElement, type: string, init: Record<string, unknown> = {}): void {
    el.dispatchEvent(new (window as unknown as { PointerEvent: new (t: string, i: object) => Event }).PointerEvent(type, { bubbles: true, ...init }));
  }

  test('指针拖拽：按下锚定 → 移动换算宽度 → 松手结束（dragging 复位，宽度留存 store）', () => {
    const state: ResizeHarness[] = [];
    const view = render(<SeparatorHarness onState={(s) => state.push(s)} />);
    const sep = view.container.querySelector('[role="separator"]') as HTMLElement;
    React.act(() => {
      fire(sep, 'pointerdown', { pointerId: 1, clientX: 200 });
    });
    React.act(() => {
      fire(sep, 'pointermove', { pointerId: 1, clientX: 260 });
    });
    expect(uiStore.getState().sidebarWidth).toBe(264 + 60);
    React.act(() => {
      fire(sep, 'pointerup', { pointerId: 1 });
    });
    expect(uiStore.getState().sidebarWidth).toBe(324);
    expect(state.at(-1)?.dragging).toBe(false);
    view.unmount();
  });

  test('钳制：拖出上限不越界（MIN 208 / MAX 400）', () => {
    const view = render(<SeparatorHarness onState={() => {}} />);
    const sep = view.container.querySelector('[role="separator"]') as HTMLElement;
    // down 与 move 分属两次 act：同一批内 transientRef 尚未随重渲刷新（与真实事件环一致）
    React.act(() => {
      fire(sep, 'pointerdown', { pointerId: 1, clientX: 200 });
    });
    React.act(() => {
      fire(sep, 'pointermove', { pointerId: 1, clientX: 2000 });
    });
    expect(uiStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
    React.act(() => {
      fire(sep, 'pointerup', { pointerId: 1 });
    });
    React.act(() => {
      fire(sep, 'pointerdown', { pointerId: 1, clientX: 200 });
    });
    React.act(() => {
      fire(sep, 'pointermove', { pointerId: 1, clientX: -2000 });
    });
    expect(uiStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    view.unmount();
  });

  test('未按下时移动不换算（先 move 后 down 的乱序事件无害）', () => {
    const view = render(<SeparatorHarness onState={() => {}} />);
    const sep = view.container.querySelector('[role="separator"]') as HTMLElement;
    React.act(() => {
      fire(sep, 'pointermove', { pointerId: 1, clientX: 9999 });
    });
    expect(uiStore.getState().sidebarWidth).toBe(264);
    view.unmount();
  });

  test('键盘微调：←/→ 细调 8、Shift+→ 粗调 32（宽度写回 store）', () => {
    const view = render(<SeparatorHarness onState={() => {}} />);
    const sep = view.container.querySelector('[role="separator"]') as HTMLElement;
    React.act(() => {
      sep.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(uiStore.getState().sidebarWidth).toBe(272);
    React.act(() => {
      sep.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    });
    expect(uiStore.getState().sidebarWidth).toBe(240);
    view.unmount();
  });
});
