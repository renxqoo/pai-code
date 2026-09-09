import { describe, expect, test } from 'bun:test';

import { isWindowStateEvent } from '../window-state';

/** pai:event 通道同时承载批推数组与壳层状态单发：守卫只放行合法 window-state 事件。 */
describe('window-state 事件守卫', () => {
  test('合法事件（maximized/fullscreen 布尔齐全）放行', () => {
    expect(isWindowStateEvent({ kind: 'window-state', maximized: true, fullscreen: false })).toBe(true);
    expect(isWindowStateEvent({ kind: 'window-state', maximized: false, fullscreen: true })).toBe(true);
  });

  test('字段缺失或类型不对的 window-state 帧拒绝（旧格式 maximized-only 不再误认）', () => {
    expect(isWindowStateEvent({ kind: 'window-state', maximized: true })).toBe(false);
    expect(isWindowStateEvent({ kind: 'window-state', fullscreen: true })).toBe(false);
    expect(isWindowStateEvent({ kind: 'window-state', maximized: 'yes', fullscreen: false })).toBe(false);
  });

  test('批推数组与其他事件形态拒绝', () => {
    expect(isWindowStateEvent([{ kind: 'window-state', maximized: true, fullscreen: false }])).toBe(false);
    expect(isWindowStateEvent(null)).toBe(false);
    expect(isWindowStateEvent('window-state')).toBe(false);
    expect(isWindowStateEvent({ kind: 'other' })).toBe(false);
  });
});
