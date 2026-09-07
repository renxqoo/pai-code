import type { UiEvent } from './ui-events';
import type { ApiMethod } from './api';

export interface ClientCapabilities {
  fileDialog: boolean;
  systemNotification: boolean;
}

export type Unsubscribe = () => void;

/**
 * 渲染层与传输之间的唯一接口：mock 实现（testkit）、Electron preload 实现
 * 与将来的其它宿主实现都满足这一形态。ui 包只允许依赖本接口。
 */
export interface Client {
  invoke(method: ApiMethod, params: unknown): Promise<unknown>;
  subscribe(onEvent: (e: UiEvent) => void): Unsubscribe;
  readonly capabilities: ClientCapabilities;
}
