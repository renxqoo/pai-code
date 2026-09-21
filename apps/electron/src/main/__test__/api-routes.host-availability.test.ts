import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';

/**
 * host 可用性可见性回归：host 从未构建（hub 路径未解析）时
 * bootstrap 曾静默返回空模型目录（composer 显示「还没有模型」误导用户去查 Provider），
 * app/runtime 快照与 app/restartHost 曾直接 internal_error。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeRoutes(work: string) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
  // runtime 不 start()：host 从未构建（hub_paths_unconfigured 的运行时形态）
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, 'r.sqlite'),
      settingsFile: join(work, 's.json'),
      providerKeysFile: join(work, 'k.json'),
      logFile: join(work, 'l.log'),
    },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => 5,
    hubPaths: () => null,
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const monitor = createRuntimeMonitor({
    host: () => null,
    hub: () => null,
    appMetrics: () => ({ rssBytes: 1, cpuPercent: 0 }),
    systemMemory: () => ({ totalBytes: null, availableBytes: null }),
    idleRecycleMinutes: () => 5,
    appVersion: () => 'test',
  });
  const routes = createApiRoutes({ runtime, settings, keyStore, monitor, exportDiagnosticsBundle: () => work, audit: () => undefined, agentDefinitions: createAgentDefinitionsStore(join(work, 'home')), agentDir, revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null) });
  return { routes, monitor };
}

describe('api-routes host 可用性（host 未构建）', () => {
  test('症状回归：bootstrap 携带 hostPhase=null（渲染层据此显示宿主未连接，而非「没有模型」）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-phase-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/bootstrap', {})) as { ok: boolean; data: { hostPhase: string | null; models: unknown[] } };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.hostPhase).toBeNull();
    expect(outcome.data.models).toEqual([]);
  });

  test('症状回归：app/runtime host 未构建不 internal_error（hostPhase=null 快照安全降级）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-diag-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/runtime', {})) as { ok: boolean; data: { hostPhase: string | null; workers: unknown[] } };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.hostPhase).toBeNull();
    expect(outcome.data.workers).toEqual([]);
  });

  test('app/diagnosticLog 空尾部（host 未构建）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-log-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/diagnosticLog', {})) as { ok: boolean; data: { stderrTail: string } };
    expect(outcome).toEqual({ ok: true, data: { stderrTail: '' } });
  });

  test('症状回归：app/restartHost 在 host 未构建时给出 host_unavailable（可读原因）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-restart-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/restartHost', {})) as { ok: boolean; error?: { kind: string; face?: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
  });
});
