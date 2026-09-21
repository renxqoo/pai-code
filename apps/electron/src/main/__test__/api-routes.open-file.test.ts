import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';
import type { FileRead } from '../file-read';
import type { OpenLocation } from '../open-location';

/**
 * shell/open 与 file/read 路由面：cwd 白名单门禁、能力注入透传、audit 落账；
 * 附 archivedSessions 偏好回写往返。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeRoutes(work: string, openLocation: OpenLocation, fileRead: FileRead) {
  const agentDir = join(work, 'agent');
  const project = join(work, 'project');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  mkdirSync(project, { recursive: true });
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
    hubPaths: () => ({ bunPath: 'bun', hubEntry: '/nonexistent/cli.js' }),
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const audits: string[] = [];
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, 'settings.json'), keyStore),
    keyStore,
    audit: (message) => audits.push(message),
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
    extraCwds: () => [project],
    openLocation,
    fileRead,
  });
  return { routes, audits, project, outside: join(work, 'outside') };
}

function makeFakeCapabilities() {
  const opens: string[] = [];
  const reads: string[] = [];
  const openLocation: OpenLocation = {
    open: (cwd, target) => {
      opens.push(`${target}:${cwd}`);
      return Promise.resolve(target === 'editor' ? { ok: false, error: { kind: 'editor_not_found' } } : { ok: true, data: null });
    },
  };
  const fileRead: FileRead = {
    read: (cwd, path) => {
      reads.push(`${cwd}/${path}`);
      return { ok: true, data: { content: 'file body', truncated: false, size: 9 } };
    },
  };
  return { openLocation, fileRead, opens, reads };
}

describe('shell/open 与 file/read 路由', () => {
  let work: string;
  let made: ReturnType<typeof makeRoutes>;
  let fake: ReturnType<typeof makeFakeCapabilities>;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'pai-open-route-'));
    fake = makeFakeCapabilities();
    made = makeRoutes(work, fake.openLocation, fake.fileRead);
  });
  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test('白名单内：能力透传 + audit 落账', async () => {
    const { routes, audits, project } = made;
    expect(await routes.invoke('shell/open', { cwd: project, target: 'finder' })).toEqual({ ok: true, data: null });
    expect(fake.opens).toEqual([`finder:${project}`]);
    expect(audits).toContain(`shell_open:finder:${project}`);
    expect(await routes.invoke('file/read', { cwd: project, path: 'src/main.ts' })).toEqual({
      ok: true,
      data: { content: 'file body', truncated: false, size: 9 },
    });
    expect(fake.reads).toEqual([`${project}/src/main.ts`]);
  });

  test('白名单外：cwd_not_allowed 先拦（能力不被调用）；file/read 不记 audit（只读）', async () => {
    const { routes, audits, outside } = made;
    const auditCount = audits.length;
    const openCount = fake.opens.length;
    const readCount = fake.reads.length;
    expect(await routes.invoke('shell/open', { cwd: outside, target: 'terminal' })).toEqual({ ok: false, error: { kind: 'cwd_not_allowed' } });
    expect(await routes.invoke('file/read', { cwd: outside, path: 'a.txt' })).toEqual({ ok: false, error: { kind: 'cwd_forbidden' } });
    expect(fake.opens.length).toBe(openCount);
    expect(fake.reads.length).toBe(readCount);
    expect(audits.length).toBe(auditCount);
  });

  test('失败 error 原样透传（editor_not_found）', async () => {
    const { routes, project } = made;
    expect(await routes.invoke('shell/open', { cwd: project, target: 'editor' })).toEqual({ ok: false, error: { kind: 'editor_not_found' } });
  });

  test('target 词表外 → invalid_params', async () => {
    const { routes, project } = made;
    expect(await routes.invoke('shell/open', { cwd: project, target: 'browser' })).toEqual({ ok: false, error: { kind: 'invalid_params' } });
  });
});

describe('archivedSessions 偏好回写往返', () => {
  test('setPreference 写入 → 偏好视图回读包含缺省空数组与写入值', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-pref-archive-'));
    const fake = makeFakeCapabilities();
    const { routes } = makeRoutes(work, fake.openLocation, fake.fileRead);
    const initial = (await routes.invoke('app/bootstrap', {})) as { ok: boolean; data: { preferences: { archivedSessions: string[] } } };
    expect(initial.ok && initial.data.preferences.archivedSessions).toEqual([]);
    const written = await routes.invoke('app/setPreference', { archivedSessions: ['/a/b.jsonl'] });
    expect(written).toEqual({
      ok: true,
      data: expect.objectContaining({ archivedSessions: ['/a/b.jsonl'] }),
    });
    rmSync(work, { recursive: true, force: true });
  });
});
