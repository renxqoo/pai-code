import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { ApiSchemas, type UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from './api-routes';
import { createAgentDirFiles } from './agent-dir-files';
import { createAgentDefinitionsStore } from './agent-definitions-store';
import { createFileLogger, createFileSettings } from './file-settings';
import { resolveHubPaths } from './hub-paths';
import { resolveAppPaths, resolveUserDataDir } from './paths';
import { createPaiRuntime } from './pai-runtime';
import { createProviderKeyStore } from './provider-key-store';
import { createRuntimeMonitor } from './runtime-monitor/create-runtime-monitor';
import { writeDiagnosticsBundle } from './export-diagnostics';

// 开启 Web 内容可访问性树（辅助技术 + 自动化验证都依赖它）
app.commandLine.appendSwitch('force-renderer-accessibility');

// 数据根缺省 ~/.pai（PAI_USER_DATA_DIR 覆盖用于 worktree 并行隔离）；必须在
// 单实例锁之前重定向——锁文件随 userData 走，重定向即获得独立锁与数据区
app.setPath('userData', resolveUserDataDir(process.env, app.getPath('home')));

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

  /** 宿主路径解析：设置覆盖 > 环境变量（开发）> dev 同级探测 > 打包产物缺省（链在 hub-paths.ts）。 */
  const resolveHubPathsForRuntime = (): { bunPath: string; hubEntry: string } | null => {
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
    return resolveHubPaths({
      fromSettings,
      fromEnv,
      fromPackaged,
      devRepoRoot: app.isPackaged ? null : join(__dirname, '..', '..', '..', '..'),
      packaged: app.isPackaged,
      exists: existsSync,
    });
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
    // 失焦通知随批发定一次（通知只关心批内是否含触发类事件，逐事件判定是
    // 高频 delta 期的无谓原生调用）
    for (const raw of batch) {
      if (notifyIfBlurred(raw as UiEvent)) break;
    }
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

  /** K1 系统通知：窗口失焦时的权限弹窗与 host 失败（任务通知走应用内通知条）。 */
  const notifyIfBlurred = (event: UiEvent): boolean => {
    if (!Notification.isSupported()) return false;
    const win = mainWindow;
    if (win !== null && !win.isDestroyed() && win.isFocused()) return false;
    if (event.type === 'dialogRequest' && event.method !== 'notify' && event.method !== 'setStatus') {
      new Notification({ title: 'pai', body: event.title ?? 'Action required' }).show();
    } else if (event.type === 'host' && event.phase === 'failed') {
      new Notification({ title: 'pai', body: 'Agent host failed to start.' }).show();
    } else if (event.type === 'host' && event.phase === 'restarting') {
      new Notification({ title: 'pai', body: 'Agent host is restarting.' }).show();
    } else if (event.type === 'turnSettled') {
      new Notification({ title: 'pai', body: 'Turn finished.' }).show();
    } else {
      return false;
    }
    return true;
  };

  // 装配段整体兜底：任何一步失败都继续开窗（渲染层经 bootstrap 失败态进设置引导），绝不静默悬挂
  let runtime: ReturnType<typeof createPaiRuntime> | null = null;
  let routes: ReturnType<typeof createApiRoutes> | null = null;
  let runtimeReady = false;
  let monitor: ReturnType<typeof createRuntimeMonitor> | null = null;
  // 目录选择对话框单飞标志（createApiRoutes 注入面闭包引用）
  let directoryPickerInFlight = false;
  // 本次运行中经系统选择器选过的目录：新任务页对尚无会话的目录也要能读分支/切分支
  const pickedDirectories = new Set<string>();
  try {
    const keyStore = createProviderKeyStore(paths.providerKeysFile);
    const settings = createFileSettings(paths.settingsFile, keyStore);
    settingsRef = settings;
    // 运行状态监控器（T29）：2s 轮询 host 本地观测面 + Electron/os 资源采样；
    // host 未构建时降级运行（快照字段安全为 null）
    monitor = createRuntimeMonitor({
      host: () => (runtimeReady ? runtime?.host ?? null : null),
      appMetrics: () => {
        let rssBytes = 0;
        let cpuPercent = 0;
        for (const metric of app.getAppMetrics()) {
          rssBytes += metric.memory.workingSetSize * 1024;
          cpuPercent += metric.cpu.percentCPUUsage;
        }
        return { rssBytes: Math.round(rssBytes), cpuPercent: Math.round(cpuPercent * 10) / 10 };
      },
      systemMemory: () => {
        const info = process.getSystemMemoryInfo();
        return { totalBytes: info.total * 1024, availableBytes: info.available * 1024 };
      },
      idleRecycleMinutes: () => settings.get().idleRecycleMinutes,
      appVersion: () => app.getVersion(),
    });
    const monitorRef = monitor;
    monitorRef.start();
    const loggingToMonitor = {
      log(message: string): void {
        logger.log(message);
        monitorRef.noteDiagnostic(message);
      },
    };
    runtime = createPaiRuntime({
      paths,
      keyStore,
      providers: () => settings.listProviders(),
      hubPaths: resolveHubPathsForRuntime,
      idleRecycleMinutes: () => settings.get().idleRecycleMinutes,
      logger: loggingToMonitor,
      emit: emitToRenderer,
    });
    const diagnosticsRoot = join(paths.userDataDir, 'diagnostics');
    routes = createApiRoutes({
      runtime,
      settings,
      keyStore,
      monitor: monitorRef,
      exportDiagnosticsBundle: () => {
        const snapshot = monitorRef.snapshot();
        const directory = writeDiagnosticsBundle(diagnosticsRoot, {
          snapshot,
          events: snapshot.events,
          stderrTail: runtime?.hostStderrTail() ?? '',
          logFile: paths.logFile,
        });
        shell.showItemInFolder(join(directory, 'summary.md'));
        return directory;
      },
      audit: (message) => logger.log(`audit:${message}`),
      agentDirFiles: createAgentDirFiles(paths.agentDir),
      agentDefinitions: createAgentDefinitionsStore(paths.agentDir),
      agentDir: paths.agentDir,
      revealPath: (path) => shell.showItemInFolder(path),
      extraCwds: () => [...pickedDirectories],
      // 对话框单飞：在途时再调用直接按取消返回（防被攻陷渲染层并发叠弹多个模态面板）
      pickDirectory: async (defaultPath) => {
        if (directoryPickerInFlight) return null;
        directoryPickerInFlight = true;
        try {
          const options = {
            properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
            ...(defaultPath !== null ? { defaultPath } : {}),
          };
          // attach 到主窗口（模态）；窗口尚未创建时退化为应用级对话框
          const target = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : undefined;
          const picked = target !== undefined ? await dialog.showOpenDialog(target, options) : await dialog.showOpenDialog(options);
          if (!picked.canceled && picked.filePaths[0] !== undefined) pickedDirectories.add(picked.filePaths[0]);
          return picked.canceled ? null : (picked.filePaths[0] ?? null);
        } finally {
          directoryPickerInFlight = false;
        }
      },
    });
    await runtime.start();
    runtimeReady = true;
    // 监控器订阅宿主观测流：心跳资源折叠 + worker 收编/死亡进时间线；
    // 相位事件走同一条线（phase 推送在 runtime 内已折叠为 UiEvent）
    // 订阅随宿主进程生命周期存续（单宿主常驻，无需退订句柄）
    runtime.host.onFrame((frame) => {
      if (frame.type === 'heartbeat') monitorRef.noteHeartbeat(frame);
      else if (frame.type === 'thread_parked') monitorRef.noteWorkerRecycled(frame.threadId, frame.reason);
      else if (frame.type === 'thread_died') monitorRef.noteWorkerDied(frame.threadId, frame.reason);
    });
    monitorRef.noteHostPhase(runtime.host.phase);
    runtime.host.onPhase((phase) => monitorRef.noteHostPhase(phase));
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
      // 会话主列随窗口自适应收缩，最小窗口宽保证列内容（含 Composer）不被压垮
      minWidth: 900,
      minHeight: 560,
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

    // 壳层状态初值：渲染层挂载时拉取一次（全屏恢复启动等无状态变更事件的场景也能对齐）
    ipcMain.removeHandler('pai:window-get-state');
    ipcMain.handle('pai:window-get-state', () => ({
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
    }));

    // 壳层状态推送（最大化/全屏）：caption 图标切换与 macOS 全屏态标题块收窄共用；
    // 经既有 pai:event 通道即时单发（不进批推）
    const publishWindowState = () => {
      if (win.isDestroyed()) return;
      win.webContents.send('pai:event', {
        kind: 'window-state',
        maximized: win.isMaximized(),
        fullscreen: win.isFullScreen(),
      });
    };
    win.on('maximize', publishWindowState);
    win.on('unmaximize', publishWindowState);
    win.on('enter-full-screen', publishWindowState);
    win.on('leave-full-screen', publishWindowState);

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl?.startsWith('http://localhost:')) {
      void win.loadURL(devUrl);
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'));
    }
    return win;
  };

  mainWindow = createMainWindow();
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }
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
    monitor?.stop();
    void runtime
      ?.stop()
      .catch(() => undefined)
      .finally(() => app.quit());
  });
});
