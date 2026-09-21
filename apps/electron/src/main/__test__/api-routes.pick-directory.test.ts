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
 * dialog/pickDirectory 路由回归（T12）：注入的目录选择器结果透传、
 * 取消返回 null、注入面异常收窄为 dialog_unavailable。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeRoutes(pickDirectory: (defaultPath: string | null) => Promise<string | null>) {
  const work = mkdtempSync(join(tmpdir(), 'pai-pick-dir-'));
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
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
  return createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory,
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
}

describe('api-routes dialog/pickDirectory（T12 新会话目录选择）', () => {
  test('选中目录透传，defaultPath 原样交给注入面', async () => {
    let seen: string | null = 'unset';
    const routes = makeRoutes((defaultPath) => {
      seen = defaultPath;
      return Promise.resolve('/w/picked');
    });
    const outcome = (await routes.invoke('dialog/pickDirectory', { defaultPath: '/w/start' })) as {
      ok: boolean;
      data: string | null;
    };
    expect(outcome).toEqual({ ok: true, data: '/w/picked' });
    expect(seen).toBe('/w/start');
  });

  test('取消 → data null；省略 defaultPath → 注入面收到 null', async () => {
    let seen: string | null = 'unset';
    const routes = makeRoutes((defaultPath) => {
      seen = defaultPath;
      return Promise.resolve(null);
    });
    const outcome = (await routes.invoke('dialog/pickDirectory', {})) as { ok: boolean; data: string | null };
    expect(outcome).toEqual({ ok: true, data: null });
    expect(seen).toBeNull();
  });

  test('注入面异常 → dialog_unavailable（不沿 IPC reject）', async () => {
    const routes = makeRoutes(() => Promise.reject(new Error('boom')));
    const outcome = (await routes.invoke('dialog/pickDirectory', {})) as { ok: boolean; error?: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'dialog_unavailable' } });
  });

  test('对抗审查补：schema 负路径——空 defaultPath / 未知键 → invalid_params（不触注入面）', async () => {
    let calls = 0;
    const routes = makeRoutes(() => {
      calls += 1;
      return Promise.resolve('/w/picked');
    });
    const empty = (await routes.invoke('dialog/pickDirectory', { defaultPath: '' })) as { ok: boolean; error?: { kind: string } };
    expect(empty).toEqual({ ok: false, error: { kind: 'invalid_params' } });
    const unknown = (await routes.invoke('dialog/pickDirectory', { nope: 1 })) as { ok: boolean; error?: { kind: string } };
    expect(unknown).toEqual({ ok: false, error: { kind: 'invalid_params' } });
    expect(calls).toBe(0);
  });
});
