import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';

/**
 * skills/list 与 skills/setEnabled 路由回归（T13）：
 * 写 pi settings skills overrides（精确名条目）、skill_not_found / write_failed、清单回读。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

const dirs: string[] = [];

function makeRoutes(piSettingsRaw: string | null = null) {
  const work = mkdtempSync(join(tmpdir(), 'pai-skills-route-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  const skillsDir = join(work, 'user-skills');
  mkdirSync(join(skillsDir, 'rxopen-hot'), { recursive: true });
  writeFileSync(join(skillsDir, 'rxopen-hot', 'SKILL.md'), '---\nname: rxopen-hot\ndescription: 查热搜\n---\n');
  if (piSettingsRaw !== null) writeFileSync(join(agentDir, 'settings.json'), piSettingsRaw);
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
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    skillSources: () => [{ origin: 'agent' as const, dir: skillsDir }],
  });
  return { routes, agentDir, skillsDir };
}

describe('api-routes skills（T13 技能开关）', () => {
  test('list：目录扫描 + 默认全启用；预置 -name 条目判禁用', async () => {
    const { routes } = makeRoutes(JSON.stringify({ skills: ['-skills/rxopen-hot'] }));
    const outcome = (await routes.invoke('skills/list', {})) as { ok: boolean; data: Array<{ name: string; enabled: boolean }> };
    expect(outcome.ok).toBe(true);
    expect(outcome.data).toEqual([{ name: 'rxopen-hot', description: '查热搜', enabled: false, origin: 'agent' }]);
  });

  test('setEnabled 禁用 → 写入 -name 且保留 settings 其余键；再启用 → 条目移除', async () => {
    const { routes, agentDir } = makeRoutes(JSON.stringify({ compaction: { enabled: false }, skills: ['+keep'] }));
    const off = (await routes.invoke('skills/setEnabled', { name: 'rxopen-hot', enabled: false })) as {
      ok: boolean;
      data: Array<{ name: string; enabled: boolean }>;
    };
    expect(off.data[0]?.enabled).toBe(false);
    expect(JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8'))).toEqual({
      compaction: { enabled: false },
      skills: ['+keep', '-skills/rxopen-hot'],
    });
    const on = (await routes.invoke('skills/setEnabled', { name: 'rxopen-hot', enabled: true })) as {
      ok: boolean;
      data: Array<{ name: string; enabled: boolean }>;
    };
    expect(on.data[0]?.enabled).toBe(true);
    expect(JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8'))).toEqual({
      compaction: { enabled: false },
      skills: ['+keep'],
    });
  });

  test('未知技能名 → skill_not_found；坏 settings.json 按 {} 起步可写', async () => {
    const { routes } = makeRoutes('{broken');
    const missing = (await routes.invoke('skills/setEnabled', { name: 'ghost', enabled: false })) as { ok: boolean; reason?: string };
    expect(missing).toEqual({ ok: false, reason: 'skill_not_found' });
    const off = (await routes.invoke('skills/setEnabled', { name: 'rxopen-hot', enabled: false })) as { ok: boolean };
    expect(off.ok).toBe(true);
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
