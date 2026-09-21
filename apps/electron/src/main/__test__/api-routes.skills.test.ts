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
 * skills/list 与 skills/setEnabled 路由回归（hub 命令面）：
 * 清单收窄（source 词表映射、disabled → enabled:false）、set_enabled 命令透传、
 * host 未启动空表降级、失败 reason 透传。技能清单真相在 hub（hub-settings skills.disabled），
 * 主进程不再本地管理。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

type SkillsEntry = Record<string, unknown>;

const dirs: string[] = [];

/** 可编程 fake host：skills 域按预置清单回放（set_enabled 记账）。 */
function fakeSkillsHost(initial: Array<SkillsEntry | string>): { port: HostProcessPort; sent: PaiCommand[] } {
  let skills: unknown[] = [...initial];
  const sent: PaiCommand[] = [];
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      sent.push(command);
      if (command.type === 'skills/list') return Promise.resolve({ ok: true, data: { skills } });
      if (command.type === 'skills/set_enabled') {
        skills = skills.map((entry) => {
          const record = typeof entry === 'object' && entry !== null ? (entry as SkillsEntry) : null;
          return record !== null && record['name'] === command.name ? { ...record, disabled: !command.enabled } : entry;
        });
        return Promise.resolve({ ok: true, data: null });
      }
      return Promise.resolve({ ok: true, data: {} });
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  return { port, sent };
}

async function makeRoutes(skills: Array<SkillsEntry | string>, options: { startHost?: boolean } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'pai-skills-route-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  // hubEntry 只需真实存在（start 的 existsSync 门）；host 本体由 fake 注入
  writeFileSync(join(work, 'cli.js'), '');
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
  const host = fakeSkillsHost(skills);
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
    // startHost=false：host 从不构建（hub 路径未解析的运行时形态）
    hubPaths: () => (options.startHost === false ? null : { bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: () => undefined },
    emit: () => undefined,
    createHost: () => host.port,
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
    monitor: createRuntimeMonitor({
      host: () => null,
      appMetrics: () => ({ rssBytes: null, cpuPercent: null }),
      systemMemory: () => ({ totalBytes: null, availableBytes: null }),
      idleRecycleMinutes: () => 5,
      appVersion: () => 'test',
    }),
    exportDiagnosticsBundle: () => work,
  });
  return { routes, runtime, sent: host.sent, agentDir };
}

const CATALOG: SkillsEntry[] = [
  { name: 'rxopen-hot', source: 'user', disabled: false },
  { name: 'rx-stock', source: 'project', disabled: false },
  { name: 'draft-writer', source: 'project', disabled: true },
];

describe('api-routes skills（hub 命令面）', () => {
  test('list：hub skills/list 收窄为视图（source 词表映射；disabled → enabled:false）', async () => {
    const { routes } = await makeRoutes(CATALOG);
    const outcome = (await routes.invoke('skills/list', {})) as { ok: boolean; data: Array<{ name: string; enabled: boolean; source: string }> };
    expect(outcome.ok).toBe(true);
    expect(outcome.data).toEqual([
      { name: 'rxopen-hot', enabled: true, source: 'user' },
      { name: 'rx-stock', enabled: true, source: 'project' },
      { name: 'draft-writer', enabled: false, source: 'project' },
    ]);
  });

  test('list：垃圾清单条目（缺名/词表外 source/非对象）丢弃不拖垮', async () => {
    const { routes } = await makeRoutes([{ source: 'user' }, { name: 'x', source: 'weird' }, 'junk', { name: 'ok', source: 'user' }]);
    const outcome = (await routes.invoke('skills/list', {})) as { ok: boolean; data: Array<{ name: string }> };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.map((item) => item.name)).toEqual(['ok']);
  });

  test('setEnabled → skills/set_enabled 命令透传，结果为写后清单（enabled 翻转）', async () => {
    const { routes, sent } = await makeRoutes(CATALOG);
    const off = (await routes.invoke('skills/setEnabled', { name: 'rxopen-hot', enabled: false })) as {
      ok: boolean;
      data: Array<{ name: string; enabled: boolean }>;
    };
    expect(off.ok).toBe(true);
    expect(off.data.find((item) => item.name === 'rxopen-hot')?.enabled).toBe(false);
    const setCmd = sent.find((command) => command.type === 'skills/set_enabled');
    expect(setCmd).toMatchObject({ type: 'skills/set_enabled', name: 'rxopen-hot', enabled: false });
    const on = (await routes.invoke('skills/setEnabled', { name: 'rxopen-hot', enabled: true })) as {
      ok: boolean;
      data: Array<{ name: string; enabled: boolean }>;
    };
    expect(on.data.find((item) => item.name === 'rxopen-hot')?.enabled).toBe(true);
  });

  test('host 未启动 → 空清单降级（不 reject）', async () => {
    const { routes } = await makeRoutes(CATALOG, { startHost: false });
    const outcome = (await routes.invoke('skills/list', {})) as { ok: boolean; data: unknown[] };
    expect(outcome).toEqual({ ok: true, data: [] });
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
