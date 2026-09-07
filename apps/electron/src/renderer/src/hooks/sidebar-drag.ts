import { clamp } from './clamp';

/**
 * 侧栏拖拽状态机（纯函数）：按下时锚定「当前宽度 + 指针坐标」，
 * 移动按指针增量换算宽度并钳制在限位内；松手清锚复位。
 * 用锚点增量而非绝对坐标，侧栏不必贴窗口左缘。
 */
export type SidebarDragState = {
  width: number
  dragging: boolean
  anchor: { width: number; pointerX: number } | null
}

export type SidebarDragLimits = {
  minWidth: number
  maxWidth: number
}

export function initialSidebarDrag(width: number): SidebarDragState {
  return { width, dragging: false, anchor: null };
}

export function sidebarDragStart(state: SidebarDragState, pointerX: number): SidebarDragState {
  return { ...state, dragging: true, anchor: { width: state.width, pointerX } };
}

export function sidebarDragMove(
  state: SidebarDragState,
  pointerX: number,
  limits: SidebarDragLimits,
): SidebarDragState {
  if (state.anchor === null) return state;
  const delta = pointerX - state.anchor.pointerX;
  return { ...state, width: clamp(state.anchor.width + delta, limits.minWidth, limits.maxWidth) };
}

export function sidebarDragEnd(state: SidebarDragState): SidebarDragState {
  if (!state.dragging) return state;
  return { ...state, dragging: false, anchor: null };
}

/** 键盘微调：Shift 加速（粗调 32 / 细调 8），同样受钳制。 */
export function sidebarDragNudge(
  state: SidebarDragState,
  step: number,
  limits: SidebarDragLimits,
): SidebarDragState {
  return { ...state, width: clamp(state.width + step, limits.minWidth, limits.maxWidth) };
}
