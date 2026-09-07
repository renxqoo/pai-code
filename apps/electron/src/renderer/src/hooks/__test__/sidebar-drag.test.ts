import { describe, expect, test } from 'bun:test';

import {
  initialSidebarDrag,
  sidebarDragEnd,
  sidebarDragMove,
  sidebarDragNudge,
  sidebarDragStart,
} from '../sidebar-drag';

const limits = { minWidth: 168, maxWidth: 320 };

describe('sidebar drag state machine', () => {
  test('anchors current width and pointer position on start', () => {
    const state = sidebarDragStart(initialSidebarDrag(188), 240);
    expect(state.dragging).toBe(true);
    expect(state.anchor).toEqual({ width: 188, pointerX: 240 });
  });

  test('applies pointer delta to anchored width, not absolute position', () => {
    // 侧栏不贴窗口左缘（分隔条在 x=1000）也应得到同样的增量
    let state = sidebarDragStart(initialSidebarDrag(200), 1000);
    state = sidebarDragMove(state, 1050, limits);
    expect(state.width).toBe(250);
    state = sidebarDragMove(state, 990, limits);
    expect(state.width).toBe(190);
  });

  test('clamps dragged width to limits', () => {
    let state = sidebarDragStart(initialSidebarDrag(200), 0);
    expect(sidebarDragMove(state, -500, limits).width).toBe(168);
    expect(sidebarDragMove(state, 500, limits).width).toBe(320);
  });

  test('move without anchor is a no-op', () => {
    const state = initialSidebarDrag(188);
    expect(sidebarDragMove(state, 999, limits)).toBe(state);
  });

  test('end clears dragging and anchor; idempotent when not dragging', () => {
    const idle = initialSidebarDrag(188);
    expect(sidebarDragEnd(idle)).toBe(idle);
    const dragging = sidebarDragStart(idle, 10);
    const ended = sidebarDragEnd(dragging);
    expect(ended.dragging).toBe(false);
    expect(ended.anchor).toBeNull();
    // 松手后残留的 pointer 事件不再改宽度
    expect(sidebarDragMove(ended, 9999, limits)).toBe(ended);
  });

  test('keyboard nudge steps and clamps', () => {
    let state = initialSidebarDrag(188);
    state = sidebarDragNudge(state, -8, limits);
    expect(state.width).toBe(180);
    state = sidebarDragNudge(state, -1000, limits);
    expect(state.width).toBe(168);
    state = sidebarDragNudge(state, 1000, limits);
    expect(state.width).toBe(320);
  });
});
