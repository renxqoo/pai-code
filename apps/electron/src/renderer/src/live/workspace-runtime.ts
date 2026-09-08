import { createBridgeClient } from './client-invoke';
import { createLiveController, type LiveController } from './live-controller';
import { createLiveStore } from './store';

/**
 * live 工作区装配单例：store / preload 桥 / controller。
 * 从 React 订阅面（use-live-workspace）与稳定动作面（workspace-actions）拆出，
 * 三者共享同一组单例，谁都不经 props 转发引用。
 */

export const store = createLiveStore();
export const bridgeClient = createBridgeClient(window.pai);
export const controller: LiveController = createLiveController(bridgeClient, store);

// 诊断句柄（e2e/排障用）：只读快照 + 事件观察
declare global {
  interface Window {
    __paiDebug?: { snapshot(): unknown };
  }
}
if (typeof window !== 'undefined') {
  window.__paiDebug = { snapshot: () => ({ ...store.getState(), controllerPhase: 'n/a' }) };
}
