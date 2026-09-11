import { describe, expect, test } from 'bun:test';

import { registerIpcWindowActions } from '../window-actions-ipc';

/** 文档语义的 ipcMain 替身：handle 登记表只受 removeHandler 影响（removeAllListeners 不清）。 */
function makeIpcMain() {
  const handlers = new Map<string, () => void>();
  return {
    handle(channel: string, fn: () => void): void {
      if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.set(channel, fn);
    },
    removeHandler(channel: string): void {
      handlers.delete(channel);
    },
    removeAllListeners(): void {
      // EventEmitter 面：不影响 handler 登记表
    },
    has(channel: string): boolean {
      return handlers.has(channel);
    },
  };
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
