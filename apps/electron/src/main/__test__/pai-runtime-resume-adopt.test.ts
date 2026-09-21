import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';

/**
 * resume 撞 already open 的收养回落回归：hub 表内已有该会话的表项（retire 后
 * parked / 他方 live）时 resume-by-path 按设计拒绝——唤醒语义 = 按 threadId 的
 * 驱动命令自动唤醒；app 侧从 thread/list 按 sessionPath 收养既有表项，
 * 恢复链路继续（症状：parked 会话懒恢复撞 already open，点开会话失败）。
 */

type Reply = HostCommandOutcome;

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

/** 会话文件布局契约路径（<sessionsRoot>/<id>/transcript.jsonl）；建 id 目录——
 *  resume 白名单对缺失文件的父目录做 realpath 归一，目录在才能落进白名单。 */
function sessionFileOf(work: string, id: string): string {
  const dir = join(work, 'agent', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'transcript.jsonl');
}

function makeRoutes(work: string, reply: (cmd: PaiCommand) => Reply) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
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
    restart: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(undefined),
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  const sent: PaiCommand[] = [];
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
    createHost: () => port,
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
  return { runtime, routes, sent, events };
}

function seedRow(runtime: PaiRuntime, row: { threadId: string; sessionPath: string; cwd: string; title: string; keepalive?: boolean }): void {
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

describe('session/resume 撞 already open（parked 懒恢复回落）', () => {
  test('症状回归：parked 会话懒恢复撞 already open——thread/list 按 path 收养既有表项，恢复链路继续', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-adopt-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes, sent, events } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: false, error: { code: 'already_open', message: 'Session already open: t1' } };
      if (cmd.type === 'thread/list') {
        // hub 表内既有表项（retire 后 parked）：顶层数组形状
        return { ok: true, data: [{ threadId: 't1', cwd: '/w/proj', sessionPath, state: 'parked' }] };
      }
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '休眠会话' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { threadId: string; title: string; state: string } };

    flushEvents(runtime);
    expect(outcome.ok).toBe(true);
    expect(outcome.data.threadId).toBe('t1');
    expect(outcome.data.title).toBe('休眠会话');
    // 收养后视图 live 化（发消息可继续）
    expect(runtime.sessions().find((view) => view.threadId === 't1')?.state).toBe('live');
    // 收养来源：thread/list 被调用
    expect(sent.some((cmd) => cmd.type === 'thread/list')).toBe(true);
    // 同 id 收养不删行
    expect(events.filter((event) => event.type === 'sessionRemoved')).toEqual([]);
    expect(runtime.registry.get('t1')?.sessionPath).toBe(sessionPath);
  });

  test('收养换 id 表项：旧行整行替换 + 常驻标志随行迁移', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-adopt-reid-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes, events } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: false, error: { code: 'already_open', message: 'Session already open: t9' } };
      if (cmd.type === 'thread/list') {
        return { ok: true, data: [{ threadId: 't9', cwd: '/w/proj', sessionPath, state: 'parked' }] };
      }
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '休眠会话', keepalive: true });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; data: { threadId: string } };

    flushEvents(runtime);
    expect(outcome.ok).toBe(true);
    expect(outcome.data.threadId).toBe('t9');
    expect(runtime.registry.get('t1')).toBeNull();
    expect(events).toContainEqual({ type: 'sessionRemoved', threadId: 't1' });
    // 常驻是会话文件的属性，随行迁移到新 id
    expect(runtime.registry.get('t9')?.keepalive).toBe(true);
  });

  test('thread/list 无同路径表项 → already open 原样上抛（不静默成功）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-resume-adopt-miss-'));
    const sessionPath = sessionFileOf(work, 'a');
    const { runtime, routes } = makeRoutes(work, (cmd) => {
      if (cmd.type === 'thread/resume') return { ok: false, error: { code: 'already_open', message: 'Session already open: t-other' } };
      if (cmd.type === 'thread/list') return { ok: true, data: [{ threadId: 't-other', cwd: '/w', sessionPath: '/elsewhere.jsonl', state: 'live' }] };
      return { ok: true, data: {} };
    });
    await runtime.start();
    seedRow(runtime, { threadId: 't1', sessionPath, cwd: '/w/proj', title: '休眠会话' });

    const outcome = (await routes.invoke('session/resume', { sessionPath })) as { ok: boolean; error?: { kind: string; message?: string } };

    expect(outcome).toEqual({ ok: false, error: { kind: 'already_open', message: 'Session already open: t-other' } });
    // 行保留（占位可重试）
    expect(runtime.registry.get('t1')?.sessionPath).toBe(sessionPath);
  });
});
