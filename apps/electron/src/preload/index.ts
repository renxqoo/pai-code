import { contextBridge, ipcRenderer } from 'electron';

import type { WindowState } from '../renderer/src/lib/window-state';

const bridge = {
  invoke(method: string, params: unknown): Promise<unknown> {
    return ipcRenderer.invoke('pai:invoke', { method, params });
  },
  subscribe(onEvent: (e: unknown) => void): () => void {
    const listener = (_e: unknown, ev: unknown): void => onEvent(ev);
    ipcRenderer.on('pai:event', listener);
    return () => ipcRenderer.removeListener('pai:event', listener);
  },
  window: {
    minimize(): Promise<void> {
      return ipcRenderer.invoke('pai:window-minimize');
    },
    toggleMaximize(): Promise<void> {
      return ipcRenderer.invoke('pai:window-toggle-maximize');
    },
    close(): Promise<void> {
      return ipcRenderer.invoke('pai:window-close');
    },
    openExternal(url: string): Promise<void> {
      return ipcRenderer.invoke('pai:window-open-external', url);
    },
    getState(): Promise<WindowState> {
      return ipcRenderer.invoke('pai:window-get-state');
    },
  },
  /** 移动端连接面（T57 桌面设备页）：状态快照 / 开关 / 配对码 / 撤销。 */
  mobile: {
    state(): Promise<unknown> {
      return ipcRenderer.invoke('pai:mobile-state');
    },
    setEnabled(enabled: boolean): Promise<{ ok: boolean } | { ok: false }> {
      return ipcRenderer.invoke('pai:mobile-set-enabled', enabled);
    },
    generatePairCode(): Promise<{ ok: true; code: string; expiresAt: number } | { ok: false; reason: string }> {
      return ipcRenderer.invoke('pai:mobile-pair-code');
    },
    revoke(deviceName: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('pai:mobile-revoke', deviceName);
    },
  },
};

contextBridge.exposeInMainWorld('pai', bridge);

export type PaiBridge = typeof bridge;
