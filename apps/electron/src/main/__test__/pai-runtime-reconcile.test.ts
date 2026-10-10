import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '@paiapp/infra';

/**
 * 启动懒恢复回归（T16）：启动/host 重启只对账（list_saved 聚合），
 * 0 个 thread/resume；确认缺失删行、暂态失败保留、parked 占位渲染；
 * resume 路由保留注册表标题、换 id 旧行整行替换；
 * resume 撞 already open 时按 thread/list 收养既有表项（parked 懒恢复回落路径）。
 */

type Reply = HostCommandOutcome;

interface SeededRow {
  threadId: string;
  sessionPath: string | null;
  cwd: string;
  title: string;
  keepalive?: boolean;
}

/** thread/list_saved 响应（hub 形状 {sessions:[{id,title,updatedAt,messageCount,cwd}]}）。 */
function savedReply(ids: string[]): { ok: true; data: unknown } {
  return {
    ok: true,
    data: {
      sessions: ids.map((id) => ({ id, title: 't', updatedAt: 2_000, messageCount: 1, cwd: '/w/proj' })),
    },
  };
}

/** 会话文件布局契约路径（<sessionsRoot>/<id>/events.jsonl）；建 id 目录——
 *  resume 白名单对缺失文件的父目录做 realpath 归一，目录在才能落进白名单。 */
function sessionFileOf(work: string, id: string): string {
  const dir = join(work, 'agent', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'events.jsonl');
}

function makeFixture(work: string, reply: (cmd: PaiCommand) => Reply) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  const logs: string[] = [];
  const sent: PaiCommand[] = [];
  let restartHook: (() => Promise<void>) | null = null;
  let frameCb: ((frame: HubFrame) => void) | null = null;
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
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
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
    idleRecycleMinutes: () => 5,
    hubPaths: () => ({ bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: (message) => logs.push(message) },
    emit: (event) => events.push(event),
    createHost: (hostDeps) => {
      restartHook = hostDeps.onRestart ?? null;
      frameCb = hostDeps.onFrame;
      return port;
    },
  });
  return {
    runtime,
    events,
    logs,
    sent,
    agentDir,
    pushFrame: (frame: HubFrame) => frameCb?.(frame),
  };
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
    keepalive: row.keepalive ?? false,
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
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir: fixture.agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return { ...fixture, routes };
}

describe('pai-runtime 启动对账（懒恢复，0 resume）', () => {
  test('症状回归：启动只对账渲染占位，不发任何 thread/resume', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-'));
    const onDisk: Record<string, string[]> = { '/w/proj': ['a', 'b'], '/w/other': ['c'] };
    const { runtime, sent } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd !== undefined && cmd.cwd in onDisk) return savedReply(onDisk[cmd.cwd] ?? []);
      return { ok: true, data: {} };
    });
        seedRow(runtime, { threadId: 't1', sessionPath: sessionFileOf(work, 'a'), cwd: '/w/proj', title: '调试' });
    seedRow(runtime, { threadId: 't2', sessionPath: sessionFileOf(work, 'b'), cwd: '/w/proj', title: '重构' });
    seedRow(runtime, { threadId: 't3', sessionPath: sessionFileOf(work, 'c'), cwd: '/w/other', title: '笔记' });

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
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply(['a']);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: sessionFileOf(work, 'a'), cwd: '/w/proj', title: '在盘' });
    seedRow(runtime, { threadId: 't4', sessionPath: sessionFileOf(work, 'd'), cwd: '/w/proj', title: '已删' });

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
    seedRow(runtime, { threadId: 't3', sessionPath: sessionFileOf(work, 'c'), cwd: '/w/proj', title: '未知' });

    await runtime.start();
    flushEvents(runtime);

    expect(runtime.registry.get('t3')?.sessionPath).toBe(sessionFileOf(work, 'c'));
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
    expect(events).toContainEqual(expect.objectContaining({ type: 'sessionUpdated', session: expect.objectContaining({ threadId: 't3', state: 'parked' }) }));
    expect(events.filter((event) => event.type === 'sessionRemoved')).toEqual([]);
    expect(logs.some((line) => line.startsWith('list_saved_failed:/w/proj'))).toBe(true);
  });

  test('症状回归（T38 D11）：旧 pai 布局注册表行（<root>/<编码cwd>/<时间戳>_<id>.jsonl）→ 对账即删行不留僵尸占位', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-legacy-'));
    const { runtime, events } = makeFixture(work, () => ({ ok: true, data: {} }));
    // 旧 pai 布局：文件在盘、也在 sessionsRoot 之下——但词法不是 <root>/<id>/transcript.jsonl
    const legacyDir = join(work, 'agent', 'sessions', 'w_proj');
    mkdirSync(legacyDir, { recursive: true });
    const legacyPath = join(legacyDir, '20240101T000000_abc123.jsonl');
    writeFileSync(legacyPath, '{}');
    seedRow(runtime, { threadId: 't6', sessionPath: legacyPath, cwd: '/w/proj', title: '旧pai会话' });

    await runtime.start();
    flushEvents(runtime);

    expect(runtime.registry.get('t6')).toBeNull();
    expect(runtime.sessions()).toEqual([]);
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't6' });
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
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply(['a']);
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: sessionFileOf(work, 'a'), cwd: '/w/proj', title: '调试' });

    await runtime.start();
    runtime.applyStartOutcome('t1', '/w/proj', sessionFileOf(work, 'a'), '调试', Date.now());
    expect(runtime.sessions()[0]?.state).toBe('live');

    await runtime.host.restart('watchdog');

    expect(sent.filter((cmd) => cmd.type === 'thread/resume')).toEqual([]);
    expect(runtime.sessions()[0]?.state).toBe('parked');
  });

  test('症状回归：对账 await 窗口内的并发 resume 不被覆写回 parked（发消息不再撞双开守卫）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-race-'));
    // start() 内的首轮对账放行；第二轮（挂起点）模拟用户在对账 await 窗口内 resume
    let listSavedCalls = 0;
    let releaseSaved: (reply: unknown) => void = () => undefined;
    const gate = new Promise<unknown>((resolve) => {
      releaseSaved = resolve;
    });
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') {
        listSavedCalls += 1;
        if (listSavedCalls === 1) return { ok: true, data: { sessions: [{ id: 'a', title: 't', updatedAt: 1, messageCount: 1, cwd: '/w/proj' }] } };
        return gate.then(() => ({ ok: true, data: { sessions: [{ id: 'a', title: 't', updatedAt: 1, messageCount: 1, cwd: '/w/proj' }] } })) as never;
      }
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath: sessionPath, cwd: '/w/proj', title: '调试' });
    await runtime.start();

    const reconciling = runtime.reconcileSessions();
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    // 对账挂起期间并发 resume 成功（applyStartOutcome 置 live 并推进注册表行）
    runtime.applyStartOutcome('t1', '/w/proj', sessionPath, '调试', Date.now());
    releaseSaved({ ok: true, data: { sessions: [{ id: 'a', title: 't', updatedAt: 1, messageCount: 1, cwd: '/w/proj' }] } });
    await reconciling;

    expect(runtime.sessions()[0]?.state).toBe('live');
  });
  test('症状回归：对账自愈污染活动时间——hub 对话时间小于行内值时纠正回对话时间（点开会话不再盖「刚刚」戳）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-heal-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') {
        return { ok: true, data: { sessions: [{ id: 'a', title: 't', updatedAt: 1_500, messageCount: 1, cwd: '/w/proj' }] } };
      }
      return { ok: true, data: {} };
    });
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧会话' });

    await runtime.start();

    expect(runtime.registry.get('t1')?.updatedAt).toBe(1_500);
    expect(runtime.sessions().find((view) => view.threadId === 't1')?.lastActivityAt).toBe(1_500);
  });

  test('症状回归：侧栏按创建时间倒序——行内 createdAt 新的排前，与活动时间无关（点开旧会话不重排）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-reconcile-order-'));
    const older = sessionFileOf(work, 'older');
    const newer = sessionFileOf(work, 'newer');
    const { runtime } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') {
        return {
          ok: true,
          data: {
            sessions: [
              { id: 'older', title: 't', updatedAt: 9_000, messageCount: 1, cwd: '/w/proj' },
              { id: 'newer', title: 't', updatedAt: 1, messageCount: 1, cwd: '/w/proj' },
            ],
          },
        };
      }
      return { ok: true, data: {} };
    });
    runtime.registry.upsert({ threadId: 't-old', sessionPath: older, cwd: '/w/proj', title: '旧', trusted: false, createdAt: 1_000, updatedAt: 2_000, keepalive: false });
    runtime.registry.upsert({ threadId: 't-new', sessionPath: newer, cwd: '/w/proj', title: '新', trusted: false, createdAt: 5_000, updatedAt: 6_000, keepalive: false });

    await runtime.start();

    expect(runtime.sessions().map((view) => view.threadId)).toEqual(['t-new', 't-old']);
  });
});


describe('api-routes 对抗审查修复面（T16 M3）', () => {
  test('session/stop remove 语义：true 删行 / false 保行摘视图（内部重开链 title/trusted 存续）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-stop-remove-'));
    const sessionPath = sessionFileOf(work, 'a');
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
    const sessionFile = sessionFileOf(work, 'x');
    writeFileSync(sessionFile, '');
    seedRow(runtime, { threadId: 't1', sessionPath: sessionFile, cwd: '/w/proj', title: '在盘' });

    await runtime.start();

    expect(runtime.registry.get('t1')?.sessionPath).toBe(sessionFile);
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
  });

  test('parked 重命名本地落注册表：不发 hub 命令、恢复标题延续', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-rename-parked-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes, sent } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply(['a']);
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
    const sessionPath = sessionFileOf(work, 'gone');
    const { runtime, routes, events } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: false, error: { code: 'session_unreadable', message: 'Session file not found' } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '已删' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; error?: { kind: string } };

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
    seedRow(runtime, { threadId: 't1', sessionPath: sessionFileOf(work, 'a'), cwd: '', title: '空目录' });

    await runtime.start();

    expect(sent.some((cmd) => cmd.type === 'thread/list_saved' && (cmd.cwd ?? '') === '')).toBe(false);
    expect(runtime.registry.get('t1')?.sessionPath).toBe(sessionFileOf(work, 'a'));
    expect(runtime.sessions().map((view) => view.state)).toEqual(['parked']);
  });
});
