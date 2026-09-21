/**
 * 红测：主进程退出挂起（before-quit 可选链短路）
 *
 * 症状：装配失败（如 registry.sqlite 损坏 → openRegistryStore 抛错 → runtime === null）
 * 时用户退出应用，before-quit 已 preventDefault，但
 *   void runtime?.stop().catch(() => undefined).finally(() => app.quit());
 * 里 runtime 为 null 使可选链短路整条链——.finally 里的 app.quit() 永不执行，
 * 退出流程挂死（非 macOS 上 window-all-closed 已触发 quit，此后无任何事件再驱动
 * 退出，进程成为无窗口僵尸，还占着单实例锁）。
 *
 * 用例驱动真实 apps/electron/src/main/index.ts（mock electron，双 userData 场景）：
 * - 控制组：runtime 正常构建（hub 路径不可用仅 start 失败）→ before-quit 后 app.quit 必被调用（应通过，证明装置有效）。
 * - 症状组：registry.sqlite 损坏 → runtime === null → before-quit 后 app.quit 永不被调用（现状为红）。
 */
import { describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const INDEX_TS = join(import.meta.dir, '..', 'index.ts');

interface FakeState {
  quitCount: number;
  setUserData: string[];
  homeDir: string;
  handlers: Map<string, Array<(event?: unknown) => void>>;
  readyResolve: (() => void) | null;
}

const state: FakeState = {
  quitCount: 0,
  setUserData: [],
  homeDir: mkdtempSync(join(tmpdir(), 'pai-fake-home-')),
  handlers: new Map(),
  readyResolve: null,
};

class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = [];
  private readonly callbacks = new Map<string, Array<() => void>>();
  shown = false;
  isFocused(): boolean { return true; }
  isDestroyed(): boolean { return false; }
  isMaximized(): boolean { return false; }
  isFullScreen(): boolean { return false; }
  isMinimized(): boolean { return false; }
  restore(): void {}
  focus(): void {}
  loadURL(): void {}
  loadFile(): void {}
  show(): void {
    this.shown = true;
  }
  on(event: string, cb: () => void): this {
    const list = this.callbacks.get(event) ?? [];
    list.push(cb);
    this.callbacks.set(event, list);
    return this;
  }
  /** 测试装置：触发窗口生命周期事件（ready-to-show/closed）。 */
  fire(event: string): void {
    for (const cb of this.callbacks.get(event) ?? []) cb();
  }
  webContents = {
    setWindowOpenHandler: (): void => undefined,
    on: (): void => undefined,
    send: (): void => undefined,
    openDevTools: (): void => undefined,
  };
  constructor() {
    FakeBrowserWindow.instances.push(this);
  }
  static getAllWindows(): FakeBrowserWindow[] {
    return FakeBrowserWindow.instances;
  }
  static reset(): void {
    FakeBrowserWindow.instances = [];
  }
}

const fakeElectron = {
  app: {
    commandLine: { appendSwitch: (): void => undefined },
    setPath: (_name: string, path: string): void => {
      state.setUserData.push(path);
    },
    getPath: (name: string): string => {
      if (name === 'home') return state.homeDir;
      const last = state.setUserData[state.setUserData.length - 1];
      return last ?? state.homeDir;
    },
    requestSingleInstanceLock: (): boolean => true,
    on: (event: string, handler: (event?: unknown) => void): void => {
      const list = state.handlers.get(event) ?? [];
      list.push(handler);
      state.handlers.set(event, list);
    },
    quit: (): void => {
      state.quitCount += 1;
    },
    whenReady: (): Promise<unknown> =>
      new Promise((resolve) => {
        state.readyResolve = () => resolve(undefined);
      }),
    isPackaged: false,
    getVersion: (): string => '0.0.0-red-test',
    getAppMetrics: (): Array<{ memory: { workingSetSize: number }; cpu: { percentCPUUsage: number } }> => [],
  },
  BrowserWindow: FakeBrowserWindow,
  dialog: {
    showOpenDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> => Promise.resolve({ canceled: true, filePaths: [] }),
  },
  Notification: class {
    show(): void {}
    static isSupported(): boolean {
      return false;
    }
  },
  shell: {
    showItemInFolder: (): void => undefined,
    openExternal: (): Promise<void> => Promise.resolve(undefined),
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => false,
    encryptString: (): Buffer => Buffer.alloc(0),
    decryptString: (): string => '',
  },
  ipcMain: {
    handle: (): void => undefined,
    removeHandler: (): void => undefined,
  },
};

mock.module('electron', () => fakeElectron);

interface QuitProbe {
  userDataDir: string;
  registryPoisoned: boolean;
  settingsHubDevBroken: boolean;
}

/** 单场景：独立 userData 驱动一次真实 index.ts，返回 before-quit 后 app.quit 的调用数。 */
async function driveIndexOnce(probe: QuitProbe, caseTag: string): Promise<{ quitCount: number; prevented: boolean; handlerRegistered: boolean }> {
  const userDataDir = mkdtempSync(join(tmpdir(), `pai-red-${caseTag}-`));
  if (probe.registryPoisoned) {
    // registry.sqlite 是损坏内容（磁盘坏块/断电截断的现场形态）→ openRegistryStore 抛错
    writeFileSync(join(userDataDir, 'registry.sqlite'), 'not a database at all (corrupted)');
  }
  if (probe.settingsHubDevBroken) {
    // hub 路径显式指向不存在文件：start() 失败但 runtime 已构建（控制组形态）
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({ hubDev: { bunPath: '/nonexistent/bun-for-red-test', hubEntry: null }, providers: [] }),
    );
  }

  state.quitCount = 0;
  state.setUserData = [];
  state.handlers = new Map();
  state.readyResolve = null;
  FakeBrowserWindow.reset();
  process.env['PAI_USER_DATA_DIR'] = userDataDir;

  // 不同 query 触发独立模块求值（bun 以完整 specifier 为缓存键）
  await import(`${INDEX_TS}?case=${caseTag}`);
  if (state.readyResolve === null) throw new Error('harness broken: whenReady not captured');
  state.readyResolve();
  // whenReady 回调推进到 handler 注册（含控制组 start() 失败的同步拒绝路径）
  await sleep(200);

  const beforeQuit = state.handlers.get('before-quit');
  if (beforeQuit === undefined || beforeQuit.length === 0) {
    return { quitCount: state.quitCount, prevented: false, handlerRegistered: false };
  }
  let prevented = false;
  beforeQuit[0]?.({ preventDefault: () => { prevented = true; } });
  // stop() 上限 gracefulExitMs=5s；控制组 host 未构建应即时完成
  await sleep(800);
  return { quitCount: state.quitCount, prevented, handlerRegistered: true };
}

describe('before-quit 退出链路（真实 index.ts + mock electron）', () => {
  test('控制组：runtime 已构建（仅 start 失败）→ before-quit 后 app.quit 被调用', async () => {
    const result = await driveIndexOnce({ userDataDir: '', registryPoisoned: false, settingsHubDevBroken: true }, 'control');
    expect(result.handlerRegistered).toBe(true);
    expect(result.quitCount).toBe(1);
  }, 15_000);

  test('症状组：registry 损坏 → runtime 为 null → before-quit 后 app.quit 永不被调用（退出挂死）', async () => {
    const result = await driveIndexOnce({ userDataDir: '', registryPoisoned: true, settingsHubDevBroken: false }, 'poison');
    expect(result.handlerRegistered).toBe(true);
    expect(result.prevented).toBe(true); // preventDefault 确已生效——退出被拦下
    expect(result.quitCount).toBe(1); // 现状：0——app.quit 永不执行，进程挂死
  }, 15_000);
});

describe('退出兜底：信号与窗口生命周期', () => {
  test('SIGTERM 走同一条停机链（before-quit 因 quitting 已置位直通，quit 恰一次）', async () => {
    const result = await driveIndexOnce({ userDataDir: '', registryPoisoned: true, settingsHubDevBroken: false }, 'sigterm');
    expect(result.handlerRegistered).toBe(true);
    process.emit('SIGTERM', 'SIGTERM');
    await sleep(800);
    expect(state.quitCount).toBe(1);
  }, 15_000);

  test('窗口生命周期回调：ready-to-show 点亮窗口，closed 置空主窗引用（重复 closed 幂等）', async () => {
    await driveIndexOnce({ userDataDir: '', registryPoisoned: true, settingsHubDevBroken: false }, 'winlife');
    const win = FakeBrowserWindow.instances.at(-1);
    expect(win).toBeDefined();
    win?.fire('ready-to-show');
    expect(win?.shown).toBe(true);
    // 壳层状态推送（最大化/全屏）：caption 图标切换与全屏态标题块共用 pai:event 单发
    win?.fire('maximize');
    win?.fire('unmaximize');
    win?.fire('enter-full-screen');
    win?.fire('leave-full-screen');
    win?.fire('closed');
    win?.fire('closed');
    // app 级回调面：second-instance 聚焦既有窗口；window-all-closed 非 macOS 退出；
    // activate 重建路径（getAllWindows 清空后重建，无窗口僵尸态）
    state.handlers.get('second-instance')?.[0]?.();
    const quitsBefore = state.quitCount;
    state.handlers.get('window-all-closed')?.[0]?.();
    if (process.platform !== 'darwin') expect(state.quitCount).toBe(quitsBefore + 1);
    FakeBrowserWindow.reset();
    state.handlers.get('activate')?.[0]?.();
    await sleep(50);
    expect(FakeBrowserWindow.instances.length).toBe(1);
  }, 15_000);
});

process.on('exit', () => {
  rmSync(state.homeDir, { recursive: true, force: true });
});
