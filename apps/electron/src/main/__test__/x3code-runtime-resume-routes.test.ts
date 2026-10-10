import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, X3codeCommand, UiEvent } from '@x3code/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../x3code-runtime';
import { createRuntimeMonitor } from '@x3code/infra';

/** session/resume 懒恢复通路面（拆自 x3code-runtime-reconcile：500 行纪律）；
 *  fixture/seedRow 与原文件同构（自含装置，不跨文件引私有 helper）。 */

type Reply = HostCommandOutcome;

function sessionFileOf(work: string, id: string): string {
  const dir = join(work, 'agent', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'events.jsonl');
}

describe('api-routes session/resume（懒恢复通路）', () => {
  test('症状回归：恢复已注册会话保留注册表标题（不再抹成 New conversation）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-title-'));
    const sessionPath = sessionFileOf(work, 'a');
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
    const sessionPath = sessionFileOf(work, 'a');
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

  test('症状回归：点击恢复不置顶——活动时间三面保留（视图/响应/注册表行），时间标签不再跳「刚刚」', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-activity-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧会话' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.lastActivityAt).toBe(2_000);
    expect(runtime.sessions().find((view) => view.threadId === 't1')?.lastActivityAt).toBe(2_000);
    expect(runtime.registry.get('t1')?.updatedAt).toBe(2_000);
  });

  test('症状回归：恢复后 host 重启对账不重排——占位 lastActivityAt = 保留值', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-reorder-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply();
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧会话' });

    const resumed = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };
    expect(resumed.data.lastActivityAt).toBe(2_000);

    await runtime.host.restart('watchdog');

    const parked = runtime.sessions().find((view) => view.threadId === 't1');
    expect(parked?.state).toBe('parked');
    expect(parked?.lastActivityAt).toBe(2_000);
  });

  test('History 首开（无注册表行）：活动时间从 0 起步（后续 turn 事件推进），不置顶为「刚刚」', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-mtime-'));
    const sessionPath = sessionFileOf(work, 'history');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    writeFileSync(sessionPath, '');
    utimesSync(sessionPath, new Date(Date.now()), new Date(Date.now()));

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    // 无行 = 零活动：mtime 很大（刚被 seed/清算事件刷新）也不得冒充对话活动
    expect(outcome.data.lastActivityAt).toBe(0);
    expect(runtime.registry.get('t1')?.updatedAt).toBe(0);
  });

  test('History 首开且文件不可读：恢复仍成功，活动时间从 0 起步', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-ghost-'));
    const sessionPath = sessionFileOf(work, 'ghost');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.lastActivityAt).toBe(0);
  });

  test('session/start 新会话活动时间 = 当前时刻（新建即活动，置顶合理）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-start-activity-'));
    const before = Date.now();
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/start') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath: null } };
      return { ok: true, data: {} };
    });
    await runtime.start();

    const outcome = (await routes.invoke('session/start', { cwd: '/w/proj' })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.lastActivityAt).toBeGreaterThanOrEqual(before);
  });

  test('对抗审查 #1：resume 续体前真活动已推进（帧先于微任务）——活动时间不得写回旧值', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-race-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes, pushFrame } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't1', cwd: '/w/proj', sessionPath } };
      if (cmd.type === 'thread/list_saved' && cmd.cwd === '/w/proj') return savedReply();
      return { ok: true, data: {} };
    });
    // 先 seed 再 start：对账渲染 parked 占位视图（推帧的活动副作用只作用于已有视图）
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧会话' });
    await runtime.start();
    expect(runtime.sessions()[0]?.state).toBe('parked');
    // 模拟 await 窗口内到达的 turn/start（同 chunk 帧同步派发先于路由续体）：行/视图已推进到当前
    const turnAt = Date.now();
    pushFrame({ type: 'event', threadId: 't1', name: 'turn/start', payload: { ts: turnAt } });
    expect(runtime.registry.get('t1')?.updatedAt ?? 0).toBeGreaterThanOrEqual(turnAt);

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.lastActivityAt).toBeGreaterThanOrEqual(turnAt);
    expect(runtime.registry.get('t1')?.updatedAt ?? 0).toBeGreaterThanOrEqual(turnAt);
    // 恢复后的下一轮照常推进（streaming 镜像重置不卡死活动）
    const secondTurnAt = Date.now();
    pushFrame({ type: 'event', threadId: 't1', name: 'turn/start', payload: { ts: secondTurnAt } });
    expect(runtime.registry.get('t1')?.updatedAt ?? 0).toBeGreaterThanOrEqual(secondTurnAt);
    pushFrame({ type: 'event', threadId: 't1', name: 'settled', payload: { ok: true } });
    expect(runtime.registry.get('t1')?.updatedAt ?? 0).toBeGreaterThanOrEqual(secondTurnAt);
  });

  test('对抗审查 #1：resume 换 id 且旧文件更旧——新行活动时间保留旧行值（不被 Date.now() 顶替）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-reid-stamp-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: true, data: { threadId: 't9', cwd: '/w/proj', sessionPath } };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '旧会话' });
    writeFileSync(sessionPath, '');
    const olderThanRow = 1_500;
    utimesSync(sessionPath, new Date(olderThanRow), new Date(olderThanRow));

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { lastActivityAt: number } };

    expect(outcome.ok).toBe(true);
    expect(outcome.data.lastActivityAt).toBe(2_000);
    expect(runtime.registry.get('t9')?.updatedAt).toBe(2_000);
  });
});

function savedReply(): { ok: true; data: unknown } {
  return { ok: true, data: { sessions: [{ id: 'a', title: 't', updatedAt: 2_000, messageCount: 1, cwd: '/w/proj' }] } };
}

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function seedRow(runtime: PaiRuntime, row: { threadId: string; sessionPath: string | null; cwd: string; title: string; keepalive?: boolean }): void {
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

function flushEvents(runtime: PaiRuntime): void {
  runtime.markBootstrapped();
  runtime.emitBuffered();
}

function makeRoutes(work: string, reply: (cmd: X3codeCommand) => Reply) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  let frameCb: ((frame: HubFrame) => void) | null = null;
  let restartHook: (() => Promise<void>) | null = null;
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: X3codeCommand) => Promise.resolve(reply(command)),
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
    logger: { log: () => undefined },
    emit: (event) => events.push(event),
    createHost: (hostDeps) => {
      frameCb = hostDeps.onFrame;
      restartHook = hostDeps.onRestart ?? null;
      return port;
    },
  });
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, 's-settings.json'), emptyKeyStore),
    keyStore: emptyKeyStore,
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return { runtime, routes, events, pushFrame: (frame: HubFrame) => frameCb?.(frame) };
}
