import { createApiClient } from '@paiapp/api';

import { createBridgeClient } from './client-invoke';
import { createLiveController, type LiveController } from './live-controller';
import { createWorkspaceActions } from './workspace-actions';
import { createLiveStore } from './store';

/**
 * live 工作区装配单例：store / preload 桥 / controller / 稳定动作面。
 * 从 React 订阅面（use-live-workspace）拆出，共享同一组单例，谁都不经 props 转发引用。
 * 顶层 window 访问必须有守卫：非 DOM 测试（bun test）import 本模块时 window 不存在。
 */

export const store = createLiveStore();
export const bridgeClient = createBridgeClient(typeof window !== 'undefined' ? window.pai : undefined);
/** UI→api 直调门面（T41：IPC 方法字符串全仓仅 @paiapp/api client.ts 与 main 注册表） */
export const apiClient = createApiClient(bridgeClient);
export const controller: LiveController = createLiveController(bridgeClient, store);
export const workspaceActions = createWorkspaceActions();

// 诊断句柄（e2e/排障用）：只读快照 + 事件观察
declare global {
  interface Window {
    __paiDebug?: { snapshot(): unknown };
  }
}
if (typeof window !== 'undefined') {
  window.__paiDebug = { snapshot: () => ({ ...store.getState(), controllerPhase: 'n/a' }) };
}
