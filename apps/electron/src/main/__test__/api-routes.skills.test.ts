import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createSkillImporter } from '../skill-import';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '@paiapp/infra';

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

/** 技能安装面脚本（inspect 逐路径回放；install 整体接管；缺省 = 乐观回放入清单）。 */
type HostScript = {
  inspect?: (sourcePath: string) => Record<string, unknown>;
  install?: (command: { sourcePath: string; name?: string; overwrite?: boolean }) => HostCommandOutcome;
};

/** 可编程 fake host：skills 域按预置清单回放（set_enabled 记账）。 */
function fakeSkillsHost(
  initial: Array<SkillsEntry | string>,
  script: HostScript = {},
): { port: HostProcessPort; sent: PaiCommand[] } {
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
      if (command.type === 'skills/inspect') {
        const results = command.sourcePaths.map(
          (sourcePath: string) =>
            script.inspect?.(sourcePath) ?? { sourcePath, state: 'ready', name: basename(sourcePath), description: '' },
        );
        return Promise.resolve({ ok: true, data: { results } });
      }
      if (command.type === 'skills/install') {
        const scripted = script.install?.(command);
        if (scripted !== undefined) return Promise.resolve(scripted);
        const name = command.name ?? basename(command.sourcePath);
        skills = [...skills.filter((entry) => (entry as SkillsEntry | null)?.name !== name), { name, source: 'user', disabled: false }];
        return Promise.resolve({ ok: true, data: { name, path: `/installed/${name}/SKILL.md`, skippedEntries: 0 } });
      }
      if (command.type === 'skills/remove') {
        skills = skills.filter((entry) => (entry as SkillsEntry | null)?.name !== command.name);
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

async function makeRoutes(
  skills: Array<SkillsEntry | string>,
  options: { startHost?: boolean; script?: HostScript; home?: (home: string) => void; pickedRoots?: (home: string) => readonly string[] } = {},
) {
  const work = mkdtempSync(join(tmpdir(), 'pai-skills-route-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  // hubEntry 只需真实存在（start 的 existsSync 门）；host 本体由 fake 注入
  writeFileSync(join(work, 'cli.js'), '');
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
  const home = join(work, 'home');
  options.home?.(home);
  const host = fakeSkillsHost(skills, options.script ?? {});
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
    skillImporter: createSkillImporter({ homeDir: home, pickedRoots: () => options.pickedRoots?.(home) ?? [] }),
    monitor: createRuntimeMonitor({
      host: () => null,
      hub: () => null,
      appMetrics: () => ({ rssBytes: null, cpuPercent: null }),
      systemMemory: () => ({ totalBytes: null, availableBytes: null }),
      idleRecycleMinutes: () => 5,
      appVersion: () => 'test',
    }),
    exportDiagnosticsBundle: () => work,
  });
  return { routes, runtime, sent: host.sent, agentDir, home };
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

describe('api-routes 技能导入（T42 M2；H 路线落盘经 hub）', () => {
  const makeHomeWithSkills = (home: string) => {
    mkdirSync(join(home, '.agents', 'skills', 'bw'), { recursive: true });
    writeFileSync(join(home, '.agents', 'skills', 'bw', 'SKILL.md'), '---\nname: bw\ndescription: d\n---\n');
    mkdirSync(join(home, '.agents', 'skills', 'tavily'), { recursive: true });
    writeFileSync(join(home, '.agents', 'skills', 'tavily', 'SKILL.md'), '---\nname: tavily-cli\ndescription: d\n---\n');
    // 嵌套形态（§9 真实结构）：深度 2 拍平
    mkdirSync(join(home, '.agents', 'skills', '@user_4998424d', 'rxopen-hot'), { recursive: true });
    writeFileSync(join(home, '.agents', 'skills', '@user_4998424d', 'rxopen-hot', 'SKILL.md'), '---\nname: rxopen-hot\ndescription: d\n---\n');
  };

  test('candidates：内置源根两深度发现 + hub 三态回放（ready/rename/blocked）', async () => {
    const inspect = (sourcePath: string): Record<string, unknown> => {
      if (sourcePath.endsWith('/tavily')) return { sourcePath, state: 'rename', name: 'tavily-cli', description: 'search' };
      if (sourcePath.endsWith('/rxopen-hot')) return { sourcePath, state: 'blocked', problem: 'frontmatter_not_flat' };
      return { sourcePath, state: 'ready', name: 'bw', description: 'bookmark' };
    };
    const { routes } = await makeRoutes([], { home: makeHomeWithSkills, script: { inspect } });
    const outcome = (await routes.invoke('skills/candidates', {})) as {
      ok: boolean;
      data: { candidates: Array<{ name: string; sourcePath: string; state: string; problem: string | null; origin: string }> };
    };
    expect(outcome.ok).toBe(true);
    const states = outcome.data.candidates.map((c) => `${c.state}:${c.name}`).sort();
    expect(states).toEqual(['blocked:rxopen-hot', 'ready:bw', 'rename:tavily-cli']);
    expect(outcome.data.candidates.every((c) => c.origin === 'agents')).toBe(true);
    expect(outcome.data.candidates.find((c) => c.state === 'blocked')?.problem).toBe('frontmatter_not_flat');
    expect(outcome.data.candidates.find((c) => c.state === 'rename')?.problem).toBe('name_mismatch');
  });

  test('candidates：显式 sourcePath 扫描批准根（picked 目录）→ origin=picked', async () => {
    const { routes, home } = await makeRoutes([], {
      home: (home) => {
        mkdirSync(join(home, 'picked-sources', 'shadcn'), { recursive: true });
        writeFileSync(join(home, 'picked-sources', 'shadcn', 'SKILL.md'), '---\nname: shadcn\ndescription: d\n---\n');
      },
      pickedRoots: (home) => [join(home, 'picked-sources')],
    });
    const outcome = (await routes.invoke('skills/candidates', { sourcePath: join(home, 'picked-sources') })) as {
      ok: boolean;
      data: { candidates: Array<{ name: string; state: string; origin: string }> };
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.candidates.map((c) => `${c.state}:${c.name}:${c.origin}`)).toEqual(['ready:shadcn:picked']);
  });

  test('import：计划参数透传 hub install；写后清单 + imported（含读回断言）', async () => {
    const { routes, sent, home } = await makeRoutes([], { home: makeHomeWithSkills });
    const sourcePath = join(home, '.agents', 'skills', 'bw');
    const outcome = (await routes.invoke('skills/import', { sourcePath, overwrite: false })) as {
      ok: boolean;
      data: { skills: Array<{ name: string }>; imported: { name: string; path: string } };
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.imported).toEqual({ name: 'bw', path: '/installed/bw/SKILL.md' });
    expect(outcome.data.skills.map((s) => s.name)).toEqual(['bw']);
    expect(sent.find((c) => c.type === 'skills/install')).toMatchObject({ type: 'skills/install', sourcePath, name: 'bw', overwrite: false });
  });

  test('import：显式改名 → 目标名透传（副本 name 行由 hub 改写）', async () => {
    const { routes, sent, home } = await makeRoutes([], { home: makeHomeWithSkills });
    const sourcePath = join(home, '.agents', 'skills', 'tavily');
    const outcome = (await routes.invoke('skills/import', { sourcePath, name: 'tavily-tool', overwrite: false })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    expect(sent.find((c) => c.type === 'skills/install')).toMatchObject({ name: 'tavily-tool' });
  });

  test('import：目标名不过围栏 → skill_name_invalid（install 不发）', async () => {
    const { routes, sent, home } = await makeRoutes([], { home: makeHomeWithSkills });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      name: '../x',
      overwrite: false,
    })) as { ok: boolean; error: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'skill_name_invalid', message: 'invalid skill name: ../x' } });
    expect(sent.find((c) => c.type === 'skills/install')).toBeUndefined();
  });

  test('import：同名 user 级已装未 overwrite → skill_exists（install 不发）', async () => {
    const { routes, sent, home } = await makeRoutes([{ name: 'bw', source: 'user', disabled: false }], { home: makeHomeWithSkills });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      overwrite: false,
    })) as { ok: boolean; error: { kind: string } };
    expect(outcome.error.kind).toBe('skill_exists');
    expect(sent.find((c) => c.type === 'skills/install')).toBeUndefined();
  });

  test('import：冲突 + overwrite → 放行（hub 备份回滚换入）', async () => {
    const { routes, sent, home } = await makeRoutes([{ name: 'bw', source: 'user', disabled: true }], { home: makeHomeWithSkills });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      overwrite: true,
    })) as { ok: boolean; data: { skills: Array<{ name: string; enabled: boolean }> } };
    expect(outcome.ok).toBe(true);
    expect(sent.find((c) => c.type === 'skills/install')).toMatchObject({ overwrite: true });
    expect(outcome.data.skills.find((s) => s.name === 'bw')?.enabled).toBe(true);
  });

  test('import：hub 回 OK 但写后回读缺席 → skill_not_registered（镜像漂移显式出口）', async () => {
    const { routes, home } = await makeRoutes([], {
      home: makeHomeWithSkills,
      script: {
        install: (command) => ({ ok: true, data: { name: command.name ?? 'ghost', path: '/x/SKILL.md', skippedEntries: 0 } }),
      },
    });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      overwrite: false,
    })) as { ok: boolean; error: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'skill_not_registered', message: 'skill written but absent from skills/list: bw' } });
  });

  test('import：blocked 候选 → 问题码对应 kind（install 不发）', async () => {
    const { routes, sent, home } = await makeRoutes([], {
      home: makeHomeWithSkills,
      script: {
        inspect: (sourcePath) => ({ sourcePath, state: 'blocked', problem: 'frontmatter_not_flat' }),
      },
    });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      overwrite: false,
    })) as { ok: boolean; error: { kind: string } };
    expect(outcome.error.kind).toBe('skill_invalid');
    expect(sent.find((c) => c.type === 'skills/install')).toBeUndefined();
  });

  test('import：旧 hub 缺命令 → skill_not_supported', async () => {
    const { routes, home } = await makeRoutes([], {
      home: makeHomeWithSkills,
      script: {
        install: () => ({ ok: false, error: { code: 'unknown_command', message: 'unknown command: skills/install' } }),
      },
    });
    const outcome = (await routes.invoke('skills/import', {
      sourcePath: join(home, '.agents', 'skills', 'bw'),
      overwrite: false,
    })) as { ok: boolean; error: { kind: string } };
    expect(outcome.error.kind).toBe('skill_not_supported');
  });

  test('import：白名单外 sourcePath → skill_source_invalid（install 不发）', async () => {
    const { routes, sent } = await makeRoutes([], { home: makeHomeWithSkills });
    const outcome = (await routes.invoke('skills/import', { sourcePath: '/etc', overwrite: false })) as {
      ok: boolean;
      error: { kind: string };
    };
    expect(outcome.error.kind).toBe('skill_source_invalid');
    expect(sent.find((c) => c.type === 'skills/install')).toBeUndefined();
  });

  test('remove：skills/remove 透传，结果为写后清单', async () => {
    const { routes, sent } = await makeRoutes([
      { name: 'bw', source: 'user', disabled: false },
      { name: 'rx-stock', source: 'user', disabled: false },
    ]);
    const outcome = (await routes.invoke('skills/remove', { name: 'bw' })) as {
      ok: boolean;
      data: Array<{ name: string }>;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.map((s) => s.name)).toEqual(['rx-stock']);
    expect(sent.find((c) => c.type === 'skills/remove')).toMatchObject({ type: 'skills/remove', name: 'bw' });
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
