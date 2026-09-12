/**
 * 壳层窗口状态（最大化/全屏）：主进程经 pai:event 单发 window-state 事件推送，
 * 初值可经 preload 桥 getState 拉取；caption 图标与 macOS 全屏态标题块收窄共用。
 */
export type WindowState = {
  maximized: boolean
  fullscreen: boolean
};

export type WindowStateEvent = WindowState & { kind: 'window-state' };

/** pai:event 通道还承载 UiEvent 逐事件直发，这里只放行壳层状态事件（其余形态降级为 false）。 */
export function isWindowStateEvent(event: unknown): event is WindowStateEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as { kind?: unknown }).kind === 'window-state' &&
    typeof (event as { maximized?: unknown }).maximized === 'boolean' &&
    typeof (event as { fullscreen?: unknown }).fullscreen === 'boolean'
  );
}
