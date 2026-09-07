import * as React from 'react';

import {
  initialSidebarDrag,
  sidebarDragEnd,
  sidebarDragMove,
  sidebarDragNudge,
  sidebarDragStart,
  type SidebarDragState,
} from './sidebar-drag';

export type SidebarResize = {
  width: number
  dragging: boolean
  separators: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  }
}

/** 键盘微调步长：Shift 粗调 32，默认细调 8。 */
const KEYBOARD_STEP = 8;
const KEYBOARD_STEP_COARSE = 32;

/**
 * 侧栏拖拽宽度：指针拖动 + 键盘微调（role=separator 语义）。
 * 宽度换算走 sidebar-drag 纯函数（锚点增量），指针捕获挂在分隔条元素上，拖出元素范围仍持续生效。
 */
export function useSidebarResize(initialWidth: number, minWidth: number, maxWidth: number): SidebarResize {
  const limits = React.useMemo(() => ({ minWidth, maxWidth }), [minWidth, maxWidth]);
  const [state, setState] = React.useState<SidebarDragState>(() => initialSidebarDrag(initialWidth));
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 捕获失败（无活动指针的合成事件）不阻断拖拽：锚点状态照常建立
    }
    setState((current) => sidebarDragStart(current, event.clientX));
  }, []);

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!stateRef.current.dragging) return;
      setState((current) => sidebarDragMove(current, event.clientX, limits));
    },
    [limits],
  );

  // 松手/取消总是结束拖拽；捕获存在时才归还
  const release = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setState((current) => sidebarDragEnd(current));
  }, []);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? KEYBOARD_STEP_COARSE : KEYBOARD_STEP;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setState((current) => sidebarDragNudge(current, -step, limits));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setState((current) => sidebarDragNudge(current, step, limits));
      }
    },
    [limits],
  );

  return {
    width: state.width,
    dragging: state.dragging,
    separators: { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release, onKeyDown },
  };
}
