import * as React from 'react';
import { useStore } from 'zustand';

import { uiStore } from '@/ui/ui-store';
import {
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

/** 拖拽瞬态（锚点/进行中标志）：宽度真相在 ui store，两者在事件时合成完整 drag 状态。 */
type DragTransient = Pick<SidebarDragState, 'dragging' | 'anchor'>;

/**
 * 侧栏拖拽宽度：指针拖动 + 键盘微调（role=separator 语义）。
 * 宽度换算走 sidebar-drag 纯函数（锚点增量），指针捕获挂在分隔条元素上，拖出元素范围仍持续生效。
 * 宽度单一真相在 ui store（跨重挂载存活）；本 hook 只持有拖拽瞬态并在每次换算后写回宽度。
 */
export function useSidebarResize(minWidth: number, maxWidth: number): SidebarResize {
  const limits = React.useMemo(() => ({ minWidth, maxWidth }), [minWidth, maxWidth]);
  const width = useStore(uiStore, (s) => s.sidebarWidth);
  const [transient, setTransient] = React.useState<DragTransient>({ dragging: false, anchor: null });
  const transientRef = React.useRef(transient);
  transientRef.current = transient;

  /** 纯函数结果落双轨：瞬态进本地，宽度进 ui store（事件回调内，天然非并发安全区外）。 */
  const apply = React.useCallback((next: SidebarDragState): void => {
    setTransient({ dragging: next.dragging, anchor: next.anchor });
    uiStore.getState().setSidebarWidth(next.width);
  }, []);
  const compose = (): SidebarDragState => ({ width: uiStore.getState().sidebarWidth, ...transientRef.current });

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 捕获失败（无活动指针的合成事件）不阻断拖拽：锚点状态照常建立
    }
    apply(sidebarDragStart(compose(), event.clientX));
  }, [apply]);

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!transientRef.current.dragging) return;
      apply(sidebarDragMove(compose(), event.clientX, limits));
    },
    [apply, limits],
  );

  // 松手/取消总是结束拖拽；捕获存在时才归还
  const release = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    apply(sidebarDragEnd(compose()));
  }, [apply]);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? KEYBOARD_STEP_COARSE : KEYBOARD_STEP;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        apply(sidebarDragNudge(compose(), -step, limits));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        apply(sidebarDragNudge(compose(), step, limits));
      }
    },
    [apply, limits],
  );

  return {
    width,
    dragging: transient.dragging,
    separators: { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release, onKeyDown },
  };
}
