import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';

/**
 * host 可用性可见性回归：host 从未构建（hub 路径未解析）时
 * bootstrap 曾静默返回空模型目录（composer 显示「还没有模型」误导用户去查 Provider），
 * app/diagnostics 与 app/restartHost 曾直接 internal_error。
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
    hubPaths: () => null,
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const routes = createApiRoutes({ runtime, settings, keyStore, audit: () => undefined, agentDirFiles: createAgentDirFiles(agentDir), revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null) });
  return { routes };
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

  test('症状回归：app/diagnostics 不再 internal_error，返回 null 相位', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-diag-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/diagnostics', {})) as { ok: boolean; data: { hostPhase: string | null; stderrTail: string } };
    expect(outcome).toEqual({ ok: true, data: { hostPhase: null, stderrTail: '', registrySessions: 0 } });
  });

  test('症状回归：app/restartHost 在 host 未构建时给出 host_unavailable（可读原因）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-host-restart-'));
    const { routes } = makeRoutes(work);
    const outcome = (await routes.invoke('app/restartHost', {})) as { ok: boolean; reason?: string };
    expect(outcome).toEqual({ ok: false, reason: 'host_unavailable' });
  });
});
