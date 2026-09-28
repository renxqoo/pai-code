/**
 * relay 生命周期门（T58）：App 根部——凭证预载、runtime 初始化、连接后 bootstrap。
 * 渲染空（纯逻辑组件）。
 */
import * as React from 'react';

import { bootstrapRelayRuntime, loadBootstrap, useRelayStatus } from './relay/runtime';

export function BridgeGate(): null {
  const { status, runtime } = useRelayStatus();

  React.useEffect(() => {
    void bootstrapRelayRuntime();
  }, []);

  React.useEffect(() => {
    if (status === 'connected' && runtime !== null) void loadBootstrap(runtime.client);
  }, [status, runtime]);

  return null;
}
