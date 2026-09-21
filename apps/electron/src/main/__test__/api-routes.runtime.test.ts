import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostDiagnostics, HostPhase, HostProcessPort, HubFrame, PaiCommand } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '@paiapp/infra';

/**
 * T29 运行状态 api 面：app/runtime 快照、档位写路径（settings + set_idle_retire_ms）、
 * 回收三命令（retire / forceRetire / setKeepalive）与诊断包导出。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

async function makeRoutes() {
  const work = mkdtempSync(join(tmpdir(), 'pai-runtime-api-'));
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
  const commands: PaiCommand[] = [];
  // 记账假宿主：全部命令应答成功（回收链的命令序列断言依赖此记录）
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand) => {
      commands.push(command);
      return Promise.resolve({ ok: true, data: {} } satisfies HostCommandOutcome);
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: (_cb: (phase: HostPhase) => void) => () => undefined,
    restart: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(undefined),
    diagnostics: (): HostDiagnostics => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  const runtime = createPaiRuntime({
    paths: { userDataDir: work, agentDir, registryDb: join(work, 'r.sqlite'), settingsFile: join(work, 's.json'), providerKeysFile: join(work, 'k.json'), logFile: join(work, 'l.log') },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => settings.get().idleRecycleMinutes,
    hubPaths: () => ({ bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: () => undefined },
    emit: () => undefined,
    createHost: () => port,
  });
  await runtime.start();
  const monitor = createRuntimeMonitor({
    host: () => null,
    hub: () => null,
    appMetrics: () => ({ rssBytes: 1, cpuPercent: 0 }),
    systemMemory: () => ({ totalBytes: null, availableBytes: null }),
    idleRecycleMinutes: () => settings.get().idleRecycleMinutes,
    appVersion: () => 'test',
  });
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    monitor,
    exportDiagnosticsBundle: () => join(work, 'bundle'),
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
  });
  return { work, routes, settings, commands, runtime, monitor };
}

describe('app/runtime 快照面', () => {
  test('快照含设置档位与应用版本（host 未构建安全降级）', async () => {
    const { routes } = await makeRoutes();
    const outcome = (await routes.invoke('app/runtime', {})) as { ok: boolean; data: { idleRecycleMinutes: number; appVersion: string; hostInfo: unknown } };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.idleRecycleMinutes).toBe(5);
    expect(outcome.data.appVersion).toBe('test');
    expect(outcome.data.hostInfo).toBeNull();
  });
});

describe('app/setIdleRecycle 档位写路径', () => {
  test('settings 持久 + set_idle_retire_ms 透传（毫秒换算）', async () => {
    const { routes, settings, commands } = await makeRoutes();
    const outcome = (await routes.invoke('app/setIdleRecycle', { minutes: 10 })) as { ok: boolean; data: { minutes: number } };
    expect(outcome).toEqual({ ok: true, data: { minutes: 10 } });
    expect(settings.get().idleRecycleMinutes).toBe(10);
    expect(commands.find((command) => command.type === 'set_idle_retire_ms')).toEqual({ type: 'set_idle_retire_ms', value: 600_000 });
  });

  test('词表外档位被 schema 拒绝', async () => {
    const { routes } = await makeRoutes();
    const outcome = (await routes.invoke('app/setIdleRecycle', { minutes: 7 })) as { ok: boolean; error?: { kind: string } };
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toEqual({ kind: 'invalid_params' });
  });
});

describe('回收命令面（命令序列契约）', () => {
  test('session/retire 只发 thread/retire', async () => {
    const { routes, commands } = await makeRoutes();
    const outcome = await routes.invoke('session/retire', { threadId: 't1' });
    expect(outcome).toEqual({ ok: true, data: null });
    expect(commands.filter((command) => command.type === 'thread/retire').length).toBe(1);
  });

  test('session/forceRetire 三连发：clear_queue → abort → retire（顺序契约）', async () => {
    const { routes, commands } = await makeRoutes();
    const outcome = await routes.invoke('session/forceRetire', { threadId: 't1' });
    expect(outcome).toEqual({ ok: true, data: null });
    const sequence = commands.filter((command) => command.type === 'clear_queue' || command.type === 'abort' || command.type === 'thread/retire').map((command) => command.type);
    expect(sequence).toEqual(['clear_queue', 'abort', 'thread/retire']);
  });

  test('session/setKeepalive：未知会话 unknown_session；注册表会话 ok 且落库', async () => {
    const { routes, runtime } = await makeRoutes();
    const ghost = (await routes.invoke('session/setKeepalive', { threadId: 'ghost', keepalive: true })) as { ok: boolean; error?: { kind: string } };
    expect(ghost).toEqual({ ok: false, error: { kind: 'unknown_session' } });

    runtime.applyStartOutcome('t1', '/w', '/w/s.jsonl', 'T', Date.now());
    const ok = (await routes.invoke('session/setKeepalive', { threadId: 't1', keepalive: true })) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(runtime.registry.get('t1')?.keepalive).toBe(true);
  });

  test('app/exportDiagnostics 返回目录', async () => {
    const { routes } = await makeRoutes();
    const outcome = (await routes.invoke('app/exportDiagnostics', {})) as { ok: boolean; data: { directory: string } };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.directory).toContain('bundle');
  });
});
