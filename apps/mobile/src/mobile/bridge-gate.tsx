/**
 * bridge 生命周期门（T57 §5）：App 根部挂载——初始化 runtime、自动重连已存令牌、
 * ready 后装载 bootstrap。渲染空（纯逻辑组件）。
 */
import * as React from 'react';

import { initializeBridge, loadBootstrap, useBridgeStatus } from './bridge-runtime';
import { bridgeStorage } from './transport/bridge-storage';

export function BridgeGate(): null {
  const { status, runtime } = useBridgeStatus();

  React.useEffect(() => {
    // 演示模式不初始化 bridge（设置页切回连接模式后立即生效）
    const token = bridgeStorage.loadToken();
    const host = bridgeStorage.loadHost();
    const bridge = initializeBridge();
    if (token !== null && host.length > 0) {
      bridge.connect(`ws://${host}:8787`, token);
    }
    return () => {
      bridge.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (status === 'ready' && runtime !== null) void loadBootstrap(runtime.client);
  }, [status, runtime]);

  return null;
}
