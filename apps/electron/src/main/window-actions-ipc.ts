import type { IpcMain } from 'electron';

/**
 * 窗口动作 IPC 注册（幂等重开安全）：Electron 的 handler 登记表只能由
 * removeHandler 清除——removeAllListeners 是 EventEmitter（.on 面）API，对
 * handle 登记表无效，同通道二次 handle 直接抛错。macOS 关窗后从 dock 重开
 * （activate → 二次 createMainWindow）必然二次注册，必须按 removeHandler 清。
 */
export function registerIpcWindowActions(
  ipcMain: Pick<IpcMain, 'removeHandler' | 'handle'>,
  actions: Record<string, (event?: unknown, ...args: unknown[]) => void>,
): void {
  for (const [action, handler] of Object.entries(actions)) {
    ipcMain.removeHandler(`pai:window-${action}`);
    ipcMain.handle(`pai:window-${action}`, handler);
  }
}
