import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';

/**
 * 启动懒恢复回归（T16）：启动/host 重启只对账（list_saved 聚合），
 * 0 个 thread/resume；确认缺失删行、暂态失败保留、parked 占位渲染；
 * resume 路由保留注册表标题、换 id 旧行整行替换。
 */

type Reply = HostCommandOutcome;

interface SeededRow {
  threadId: string;
  sessionPath: string | null;
  cwd: string;
  title: string;
}

function savedReply(paths: string[]): { ok: true; data: unknown } {
  return {
    ok: true,
    data: {
      sessions: paths.map((path) => ({ path, id: 'sid', cwd: '', name: null, modified: '2026-01-01T00:00:00Z', messageCount: 1, firstMessage: '' })),
    },
  };
}

function makeFixture(work: string, reply: (cmd: PaiCommand) => Reply) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  const logs: string[] = [];
  const sent: PaiCommand[] = [];
  let restartHook: (() => Promise<void>) | null = null;
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand) => {
      sent.push(command);
      return Promise.resolve(reply(command));
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: (_cb: (phase: HostPhase) => void) => () => undefined,
    restart: async () => {
      await restartHook?.();
    },
    dispose: () => Promise.resolve(undefined),
    diagnostics: () => ({ stderrTail: '' }),
  };
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, 'r.sqlite'),
      settingsFile: join(work, 's.json'),
      providerKeysFile: join(work, 'k.json'),
      logFile: join(work, 'l.log'),
    },
    keyStore: emptyKeyStore,
    providers: () => [],
    hubPaths: () => ({ bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: (message) => logs.push(message) },
    emit: (event) => events.push(event),
    createHost: (hostDeps) => {
      restartHook = hostDeps.onRestart ?? null;
      return port;
    },
  });
  return { runtime, events, logs, sent, agentDir };
}

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function seedRow(runtime: PaiRuntime, row: SeededRow): void {
  runtime.registry.upsert({
    threadId: row.threadId,
    sessionPath: row.sessionPath,
    cwd: row.cwd,
    title: row.title,
    trusted: false,
    createdAt: 1_000,
    updatedAt: 2_000,
  });
}

/** 事件缓冲冲刷（启动期事件先入缓冲，bootstrap 后才外发）。 */
function flushEvents(runtime: PaiRuntime): void {
  runtime.markBootstrapped();
  runtime.emitBuffered();
}

function makeRoutes(work: string, reply: (cmd: PaiCommand) => Reply) {
  const fixture = makeFixture(work, reply);
  const settings = createFileSettings(join(work, 's-settings.json'), emptyKeyStore);
  const routes = createApiRoutes({
    runtime: fixture.runtime,
    settings,
    keyStore: emptyKeyStore,
    audit: () => undefined,
    agentDirFiles: createAgentDirFiles(fixture.agentDir),
    agentDir: fixture.agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
  });
  return { ...fixture, routes };
}

describe('pai-runtime 启动对账（懒恢复，0 resume）', () => {
  test('症状回归：启动只对账渲染占位，不发任何 thread/resume', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-'));
    const onDisk: Record<string, string[]> = { '/w/proj': ['a.jsonl', 'b.jsonl'], '/w/other': ['c.jsonl'] };
    const { runtime, sent } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd !== undefined && cmd.cwd in onDisk) return savedReply(onDisk[cmd.cwd] ?? []);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: 'a.jsonl', cwd: '/w/proj', title: '调试' });
    seedRow(runtime, { threadId: 't2', sessionPath: 'b.jsonl', cwd: '/w/proj', title: '重构' });
    seedRow(runtime, { threadId: 't3', sessionPath: 'c.jsonl', cwd: '/w/other', title: '笔记' });

    await runtime.start();

    expect(sent.filter((cmd) => cmd.type === 'thread/resume')).toEqual([]);
    expect(sent.filter((cmd) => cmd.type === 'thread/list_saved').length).toBe(2);
    const views = runtime.sessions();
    expect(views.map((view) => view.state)).toEqual(['parked', 'parked', 'parked']);
    expect(views.map((view) => view.title)).toEqual(['调试', '重构', '笔记']);
    expect(views.every((view) => view.lastActivityAt === 2_000)).toBe(true);
  });

  test('确认缺失（该 cwd 列举成功且不含此文件）→ 删行 + sessionRemoved', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-missing-'));
    const { runtime, sent, events } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply(['a.jsonl']);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: 'a.jsonl', cwd: '/w/proj', title: '在盘' });
    seedRow(runtime, { threadId: 't4', sessionPath: 'd.jsonl', cwd: '/w/proj', title: '已删' });

    await runtime.start();
    flushEvents(runtime);

    expect(runtime.registry.get('t4')).toBeNull();
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't4' });
    expect(runtime.sessions().map((view) => view.threadId)).toEqual(['t1']);
    expect(sent.filter((cmd) => cmd.type === 'thread/resume')).toEqual([]);
  });

  test('list_saved 暂态失败 → 行保留为占位（不删恢复依据）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-degraded-'));
    const { runtime, events, logs } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return { ok: false, error: 'timeout' };
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't3', sessionPath: 'c.jsonl', cwd: '/w/proj', title: '未知' });

    await runtime.start();
    flushEvents(runtime);

    expect(runtime.registry.get('t3')?.sessionPath).toBe('c.jsonl');
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
    expect(events).toContainEqual(expect.objectContaining({ type: 'sessionUpdated', session: expect.objectContaining({ threadId: 't3', state: 'parked' }) }));
    expect(events.filter((event) => event.type === 'sessionRemoved')).toEqual([]);
    expect(logs.some((line) => line.startsWith('list_saved_failed:/w/proj'))).toBe(true);
  });

  test('sessionPath null（从未有首条消息）→ 清理 + sessionRemoved', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-empty-'));
    const { runtime, events } = makeFixture(work, () => ({ ok: true, data: {} }));
    seedRow(runtime, { threadId: 't5', sessionPath: null, cwd: '/w/proj', title: '空' });

    await runtime.start();
    flushEvents(runtime);

    expect(runtime.registry.get('t5')).toBeNull();
    expect(runtime.sessions()).toEqual([]);
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't5' });
  });

  test('host 重启钩子：对账回落 parked，无 thread/resume', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-restart-'));
    const { runtime, sent } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply(['a.jsonl']);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: 'a.jsonl', cwd: '/w/proj', title: '调试' });

    await runtime.start();
    runtime.applyStartOutcome('t1', '/w/proj', 'a.jsonl', '调试');
    expect(runtime.sessions()[0]?.state).toBe('live');

    await runtime.host.restart('watchdog');

    expect(sent.filter((cmd) => cmd.type === 'thread/resume')).toEqual([]);
    expect(runtime.sessions()[0]?.state).toBe('parked');
  });
});

describe('api-routes session/resume（懒恢复通路）', () => {
  test('症状回归：恢复已注册会话保留注册表标题（不再抹成 New conversation）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-title-'));
    const sessionPath = join(work, 'agent', 'sessions', 'a.jsonl');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '项目调试' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { title: string } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.title).toBe('项目调试');
    expect(runtime.registry.get('t1')?.title).toBe('项目调试');
  });

  test('threadId 只信响应：resume 换 id → 旧行删除 + sessionRemoved + 新行落库', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-reid-'));
    const sessionPath = join(work, 'agent', 'sessions', 'a.jsonl');
    const { runtime, routes, events } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't9', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '项目调试' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { threadId: string } };

    flushEvents(runtime);
    expect(outcome.ok).toBe(true);
    expect(outcome.data.threadId).toBe('t9');
    expect(runtime.registry.get('t1')).toBeNull();
    expect(runtime.registry.get('t9')?.sessionPath).toBe(sessionPath);
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't1' });
    expect(runtime.sessions().map((view) => view.threadId)).toEqual(['t9']);
  });
});

describe('api-routes 对抗审查修复面（T16 M3）', () => {
  test('session/stop remove 语义：true 删行 / false 保行摘视图（内部重开链 title/trusted 存续）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-stop-remove-'));
    const sessionPath = join(work, 'agent', 'sessions', 'a.jsonl');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '项目调试' });

    const kept = (await routes.invoke('session/stop', { threadId: 't1', remove: false })) as { ok: boolean };
    expect(kept.ok).toBe(true);
    expect(runtime.registry.get('t1')?.title).toBe('项目调试');
    expect(runtime.sessions().map((view) => view.threadId)).toEqual([]);

    // 保行重开：resume 路由按注册表行补全 trusted/title（行在，语义自洽）
    const resumed = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { title: string } };
    expect(resumed.ok).toBe(true);
    expect(resumed.data.title).toBe('项目调试');

    const closed = (await routes.invoke('session/stop', { threadId: 't1', remove: true })) as { ok: boolean };
    expect(closed.ok).toBe(true);
    expect(runtime.registry.get('t1')).toBeNull();
  });

  test('对账双证据：list_saved 列举缺失但文件在盘 → 保留占位（防 cwd 编码差异误删）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-proof-'));
    const { runtime } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply([]);
      return { ok: true, data: {} };
    });
    const sessionFile = join(work, 'agent', 'sessions', 'x.jsonl');
    writeFileSync(sessionFile, '');
    seedRow(runtime, { threadId: 't1', sessionPath: sessionFile, cwd: '/w/proj', title: '在盘' });

    await runtime.start();

    expect(runtime.registry.get('t1')?.sessionPath).toBe(sessionFile);
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
  });

  test('parked 重命名本地落注册表：不发 hub 命令、恢复标题延续', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-rename-parked-'));
    const sessionPath = join(work, 'agent', 'sessions', 'a.jsonl');
    const { runtime, routes, sent } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply([sessionPath]);
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧名' });
    await runtime.start();
    expect(runtime.sessions()[0]?.state).toBe('parked');

    const renamed = (await routes.invoke('session/setName', { threadId: 't1', name: '新名' })) as { ok: boolean };
    expect(renamed.ok).toBe(true);
    expect(sent.some((cmd) => cmd.type === 'set_session_name')).toBe(false);
    expect(runtime.registry.get('t1')?.title).toBe('新名');

    const resumed = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { title: string } };
    expect(resumed.data.title).toBe('新名');
  });

  test('resume not-found（运行中文件被删）→ 删行 + sessionRemoved，占位不再反复失败', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-notfound-'));
    const sessionPath = join(work, 'agent', 'sessions', 'gone.jsonl');
    const { runtime, routes, events } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: false, error: 'Session file not found' };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '已删' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; reason?: string };

    expect(outcome.ok).toBe(false);
    flushEvents(runtime);
    expect(runtime.registry.get('t1')).toBeNull();
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't1' });
  });
});

describe('对账边界：空 cwd 行', () => {
  test('cwd 为空串的行不列举不删行，保留占位（resume 由 hub 按会话头 cwd 自愈）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-emptycwd-'));
    const { runtime, sent } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved') return savedReply([]);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: 'a.jsonl', cwd: '', title: '空目录' });

    await runtime.start();

    expect(sent.some((cmd) => cmd.type === 'thread/list_saved' && (cmd.cwd ?? '') === '')).toBe(false);
    expect(runtime.registry.get('t1')?.sessionPath).toBe('a.jsonl');
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
  });
});
