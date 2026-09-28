/**
 * bridge 生命周期门（T57 §5）：App 根部挂载——存储预载、初始化 runtime、
 * 自动重连已存令牌、ready 后装载 bootstrap（全 app 唯一触发点）。
 * 渲染空（纯逻辑组件）。
 */
import * as React from 'react';

import { initializeBridge, loadBootstrap, useBridgeStatus } from './bridge-runtime';
import { bridgeStorage, preloadBridgeStorage } from './transport/bridge-storage';

export function BridgeGate(): null {
  const { status, runtime } = useBridgeStatus();

  React.useEffect(() => {
    // 异步存储预载（令牌/host）→ 再决定是否自动连接；卸载即断
    let cancelled = false;
    void preloadBridgeStorage().then(() => {
      if (cancelled) return;
      const token = bridgeStorage.loadToken();
      const host = bridgeStorage.loadHost();
      const bridge = initializeBridge();
      if (token !== null && host.length > 0) {
        bridge.connect(`ws://${host}:8787`, token);
      }
    });
    return () => {
      cancelled = true;
      getBridgeDisconnect();
    };
  }, []);

  React.useEffect(() => {
    if (status === 'ready' && runtime !== null) void loadBootstrap(runtime.client);
  }, [status, runtime]);

  return null;
}

/** 卸载路径：只断传输，不销毁单例（再次挂载复用同一 runtime）。 */
function getBridgeDisconnect(): void {
  initializeBridge().disconnect();
}
