import { describe, expect, test } from 'bun:test';

import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import { registerIpcWindowActions } from '../window-actions-ipc';

/** 文档语义的 ipcMain 替身：handle 登记表只受 removeHandler 影响（removeAllListeners 不清）。 */
function makeIpcMain() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'> & { has(channel: string): boolean } = {
    handle(channel, fn) {
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.set(channel, fn);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
    has(channel) {
      return handlers.has(channel);
    },
  };
  return ipcMain;
}

describe('registerIpcWindowActions', () => {
  test('症状回归「macOS 关窗后 dock 重开：二次注册 handle 抛错白窗崩溃」：重开路径幂等重注册', () => {
    const ipcMain = makeIpcMain();
    const actions = { minimize: () => undefined, close: () => undefined };
    registerIpcWindowActions(ipcMain, actions);
    expect(ipcMain.has('pai:window-minimize')).toBe(true);
    // 关窗 → dock 重开：同通道二次注册不得抛错
    expect(() => registerIpcWindowActions(ipcMain, actions)).not.toThrow();
    expect(ipcMain.has('pai:window-close')).toBe(true);
  });
});
