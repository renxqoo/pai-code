import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';

/**
 * command/preview 路由回归：新建任务页（无会话）`/` 补全的预构目录——
 * 用户级启用技能（hub skills/list）以 skill: 条目下发，禁用技能不进目录，
 * host 未启动时空形态降级。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

const dirs: string[] = [];

/** fake host：skills/list 回放预置清单。 */
function fakeHost(skills: Array<Record<string, unknown>>): HostProcessPort {
  return {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      if (command.type === 'skills/list') return Promise.resolve({ ok: true, data: { skills } });
      return Promise.resolve({ ok: true, data: {} });
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
}

async function makeRoutes(options: { skills?: Array<Record<string, unknown>>; startHost?: boolean } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'pai-command-preview-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
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
    hubPaths: () => (options.startHost === false ? null : { bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: () => undefined },
    emit: () => undefined,
    createHost: () => fakeHost(options.skills ?? []),
  });
  if (options.startHost !== false) await runtime.start();
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return routes;
}

describe('api-routes command/preview（新建任务页预构命令目录）', () => {
  test('症状回归：新建任务页输入 / 无命令面板——启用技能以 skill: 条目下发预构目录', async () => {
    const routes = await makeRoutes({
      skills: [
        { name: 'rxopen-hot', source: 'skill-user', disabled: false },
        { name: 'rx-stock', source: 'skill-user', disabled: false },
      ],
    });
    const outcome = (await routes.invoke('command/preview', {})) as {
      ok: boolean;
      data: Array<{ name: string; description: string | null; source: string }>;
    };
    expect(outcome.ok).toBe(true);
    expect([...outcome.data].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'skill:rx-stock', description: null, source: 'skill' },
      { name: 'skill:rxopen-hot', description: null, source: 'skill' },
    ]);
  });

  test('禁用技能不进目录（hub skills.disabled 名单过滤后仅启用项）', async () => {
    const routes = await makeRoutes({
      skills: [
        { name: 'rxopen-hot', source: 'skill-user', disabled: true },
        { name: 'rx-stock', source: 'skill-user', disabled: false },
      ],
    });
    const outcome = (await routes.invoke('command/preview', {})) as {
      ok: boolean;
      data: Array<{ name: string }>;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.map((item) => item.name)).toEqual(['skill:rx-stock']);
  });

  test('host 未启动 → 空目录（空形态降级，不报错）', async () => {
    const routes = await makeRoutes({ startHost: false });
    const outcome = (await routes.invoke('command/preview', {})) as { ok: boolean; data: unknown[] };
    expect(outcome).toEqual({ ok: true, data: [] });
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
