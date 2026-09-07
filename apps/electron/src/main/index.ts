import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { ApiSchemas, type UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from './api-routes';
import { createFileLogger, createFileSettings } from './file-settings';
import { resolveAppPaths } from './paths';
import { createPaiRuntime } from './pai-runtime';
import { createProviderKeyStore } from './provider-key-store';

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void app.whenReady().then(async () => {
  const paths = resolveAppPaths(app.getPath('userData'));
  const logger = createFileLogger(paths.logFile);
  const keyStore = createProviderKeyStore(paths.providerKeysFile);
  const settings = createFileSettings(paths.settingsFile, keyStore);

  /** 宿主路径解析：设置覆盖 > 环境变量（开发）> 打包产物缺省。 */
  const resolveHubPaths = (): { bunPath: string; hubEntry: string } | null => {
    const fromSettings =
      settings.get().hubDev.hubEntry !== null && settings.get().hubDev.bunPath !== null
        ? { bunPath: settings.get().hubDev.bunPath as string, hubEntry: settings.get().hubDev.hubEntry as string }
        : null;
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
  const emitToRenderer = (event: UiEvent): void => {
    mainWindow?.webContents.send('pai:event', event);
  };

  const runtime = createPaiRuntime({
    paths,
    keyStore,
    providers: () => settings.listProviders(),
    hubPaths: resolveHubPaths,
    logger,
    emit: emitToRenderer,
  });

  const routes = createApiRoutes({ runtime, settings, keyStore });

  try {
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
    return routes.invoke(method, params ?? {});
  });

  const isDarwin = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
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

  // 壳层窗口控制：渲染层经 preload 桥触发，与业务通道 pai:invoke 分离
  const windowActions: Record<string, () => void> = {
    minimize: () => mainWindow?.minimize(),
    'toggle-maximize': () => {
      if (mainWindow === null) return;
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
    close: () => mainWindow?.close(),
  };
  for (const [action, handler] of Object.entries(windowActions)) {
    ipcMain.handle(`pai:window-${action}`, handler);
  }
  // 外链出口：仅放行 http(s)，其余协议一律拒绝（渲染层解析已过滤，这里纵深防御）
  ipcMain.handle('pai:window-open-external', (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
    void shell.openExternal(url);
  });

  // caption 图标随最大化状态切换，经既有 pai:event 通道推送
  const publishMaximized = () => {
    mainWindow?.webContents.send('pai:event', { kind: 'window-state', maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('maximize', publishMaximized);
  mainWindow.on('unmaximize', publishMaximized);

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  // 退出时序：先停 host（stdin EOF 落盘退出）再退 app；只执行一次
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void runtime
      .stop()
      .catch(() => undefined)
      .finally(() => {
        app.quit();
      });
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl?.startsWith('http://localhost:')) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
});
