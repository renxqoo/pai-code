import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';

/**
 * command/preview 路由回归：新建任务页（无会话）`/` 补全的预构目录——
 * 用户级启用技能以 skill: 条目下发，禁用技能不进目录，无技能时空形态降级。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

const dirs: string[] = [];

function makeRoutes(options: { piSettingsRaw?: string; emptySkills?: boolean } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'pai-command-preview-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  const skillsDir = join(work, 'user-skills');
  for (const name of ['rxopen-hot', 'rx-stock']) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    writeFileSync(join(skillsDir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} 技能\n---\n`);
  }
  if (options.piSettingsRaw !== undefined) writeFileSync(join(agentDir, 'settings.json'), options.piSettingsRaw);
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
    hubPaths: () => null,
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: () => undefined,
    agentDirFiles: createAgentDirFiles(agentDir),
    agentDefinitions: createAgentDefinitionsStore(agentDir),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    skillSources: () => (options.emptySkills === true ? [] : [{ origin: 'agent' as const, dir: skillsDir }]),
  });
  return routes;
}

describe('api-routes command/preview（新建任务页预构命令目录）', () => {
  test('症状回归：新建任务页输入 / 无命令面板——启用技能以 skill: 条目下发预构目录', async () => {
    const routes = makeRoutes();
    const outcome = (await routes.invoke('command/preview', {})) as {
      ok: boolean;
      data: Array<{ name: string; description: string | null; source: string }>;
    };
    expect(outcome.ok).toBe(true);
    expect([...outcome.data].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'skill:rx-stock', description: 'rx-stock 技能', source: 'skill' },
      { name: 'skill:rxopen-hot', description: 'rxopen-hot 技能', source: 'skill' },
    ]);
  });

  test('禁用技能不进目录（pi settings overrides 过滤后仅启用项）', async () => {
    const routes = makeRoutes({ piSettingsRaw: JSON.stringify({ skills: ['-skills/rxopen-hot'] }) });
    const outcome = (await routes.invoke('command/preview', {})) as {
      ok: boolean;
      data: Array<{ name: string }>;
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.map((item) => item.name)).toEqual(['skill:rx-stock']);
  });

  test('无技能 → 空目录（空形态降级，不报错）', async () => {
    const routes = makeRoutes({ emptySkills: true });
    const outcome = (await routes.invoke('command/preview', {})) as { ok: boolean; data: unknown[] };
    expect(outcome).toEqual({ ok: true, data: [] });
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
