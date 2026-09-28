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
};

contextBridge.exposeInMainWorld('pai', bridge);

export type PaiBridge = typeof bridge;
