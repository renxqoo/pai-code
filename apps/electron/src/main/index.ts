import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { ApiSchemas, type UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from './api-routes';
import { createAgentDirFiles } from './agent-dir-files';
import { createFileLogger, createFileSettings } from './file-settings';
import { resolveAppPaths } from './paths';
import { createPaiRuntime } from './pai-runtime';
import { createProviderKeyStore } from './provider-key-store';

// 开启 Web 内容可访问性树（辅助技术 + 自动化验证都依赖它）
app.commandLine.appendSwitch('force-renderer-accessibility');

// 单实例锁：双开会在 sqlite 注册表与 host 进程上互相踩踏，第二实例聚焦首实例后退出
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void app.whenReady().then(async () => {
  const paths = resolveAppPaths(app.getPath('userData'));
  const logger = createFileLogger(paths.logFile);

  let settingsRef: ReturnType<typeof createFileSettings> | null = null;

  /** 宿主路径解析：设置覆盖 > 环境变量（开发）> 打包产物缺省。 */
  const resolveHubPaths = (): { bunPath: string; hubEntry: string } | null => {
    const fromSettings = (() => {
      try {
        const hubDev = settingsRef?.get().hubDev;
        return hubDev !== undefined && hubDev.hubEntry !== null && hubDev.bunPath !== null
          ? { bunPath: hubDev.bunPath, hubEntry: hubDev.hubEntry }
          : null;
      } catch {
        return null;
      }
    })();
    const fromEnv =
      process.env['PAI_HUB_ENTRY'] !== undefined
        ? { bunPath: process.env['PAI_BUN_PATH'] ?? 'bun', hubEntry: process.env['PAI_HUB_ENTRY'] }
        : null;
    const resources = process.resourcesPath ?? paths.userDataDir;
    const packagedEntry = join(resources, 'pai-cli', 'cli.js');
    const fromPackaged = existsSync(packagedEntry) ? { bunPath: join(resources, 'bun', 'bun'), hubEntry: packagedEntry } : null;
    return fromSettings ?? fromEnv ?? fromPackaged;
  };

  let mainWindow: BrowserWindow | null = null;
  /** 事件批推缓冲：50ms 分桶（流式 delta 高频，逐条 IPC 直推会放大渲染层压力）。 */
  let pendingEvents: unknown[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushEvents = (): void => {
    flushTimer = null;
    if (pendingEvents.length === 0) return;
    const batch = pendingEvents;
    pendingEvents = [];
    const target = mainWindow;
    if (target === null || target.isDestroyed()) return;
    target.webContents.send('pai:event', batch);
  };
  const emitToRenderer = (event: UiEvent): void => {
    pendingEvents.push(event);
    if (pendingEvents.length >= 128) {
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushEvents();
      return;
    }
    flushTimer ??= setTimeout(flushEvents, 50);
  };

  // 装配段整体兜底：任何一步失败都继续开窗（渲染层经 bootstrap 失败态进设置引导），绝不静默悬挂
  let runtime: ReturnType<typeof createPaiRuntime> | null = null;
  let routes: ReturnType<typeof createApiRoutes> | null = null;
  try {
    const keyStore = createProviderKeyStore(paths.providerKeysFile);
    const settings = createFileSettings(paths.settingsFile, keyStore);
    settingsRef = settings;
    runtime = createPaiRuntime({
      paths,
      keyStore,
      providers: () => settings.listProviders(),
      hubPaths: resolveHubPaths,
      logger,
      emit: emitToRenderer,
    });
    routes = createApiRoutes({
      runtime,
      settings,
      keyStore,
      audit: (message) => logger.log(`audit:${message}`),
      agentDirFiles: createAgentDirFiles(paths.agentDir),
      revealPath: (path) => shell.showItemInFolder(path),
    });
    await runtime.start();
  } catch (error) {
    logger.log(`runtime_start_failed:${error instanceof Error ? error.message : String(error)}`);
    // host 未就绪也继续开窗：渲染层展示设置引导（配置 provider/宿主路径）
  }

  ipcMain.handle('pai:invoke', (_event, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false, reason: 'invalid_payload' };
    }
    const { method, params } = payload as { method?: unknown; params?: unknown };
    if (typeof method !== 'string' || !(method in ApiSchemas)) {
      return { ok: false, reason: `unknown_method:${String(method)}` };
    }
    if (routes === null) return { ok: false, reason: 'host_unavailable' };
    return routes.invoke(method, params ?? {});
  });

  const createMainWindow = (): BrowserWindow => {
    const isDarwin = process.platform === 'darwin';
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      // macOS 红绿灯内嵌；Windows 隐藏标题栏（保留系统边框可 resize），caption 由渲染层自绘
      titleBarStyle: isDarwin ? 'hiddenInset' : 'hidden',
      ...(isDarwin ? { trafficLightPosition: { x: 14, y: 17 } } : {}),
      webPreferences: {
        // 沙箱渲染进程只接受 CJS preload（构建配置同步输出 .cjs）
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null;
    });
    win.on('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    // 壳层窗口控制：渲染层经 preload 桥触发，与业务通道 pai:invoke 分离
    const windowActions: Record<string, () => void> = {
      minimize: () => win.minimize(),
      'toggle-maximize': () => {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      },
      close: () => win.close(),
    };
    for (const [action, handler] of Object.entries(windowActions)) {
      ipcMain.removeAllListeners(`pai:window-${action}`);
      ipcMain.handle(`pai:window-${action}`, handler);
    }
    // 外链出口：仅放行 http(s)，其余协议一律拒绝（渲染层解析已过滤，这里纵深防御）
    ipcMain.removeHandler('pai:window-open-external');
    ipcMain.handle('pai:window-open-external', (_event, url) => {
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
      void shell.openExternal(url);
    });

    // caption 图标随最大化状态切换，经既有 pai:event 通道推送（即时单发，不进批推）
    const publishMaximized = () => {
      if (win.isDestroyed()) return;
      win.webContents.send('pai:event', { kind: 'window-state', maximized: win.isMaximized() });
    };
    win.on('maximize', publishMaximized);
    win.on('unmaximize', publishMaximized);

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl?.startsWith('http://localhost:')) {
      void win.loadURL(devUrl);
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'));
    }
    return win;
  };

  mainWindow = createMainWindow();

  // macOS dock 重开：关窗后 app 常驻，activate 重建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });

  // 退出时序：先停 host（stdin EOF 落盘退出）再退 app；只执行一次
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushEvents();
    void runtime
      ?.stop()
      .catch(() => undefined)
      .finally(() => {
        app.quit();
      });
  });
});
