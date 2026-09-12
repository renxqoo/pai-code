import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';

/**
 * 事件/响应单一全序的主进程侧结构测试（IPC 直发后无冲批钩子，全序由「emit 同步
 * 直发」结构性保证）：hub 同管道先发事件帧后发 response——帧分发内的 emit
 * （= 装配层 webContents.send 的时机）必须先于 routes.invoke 的 promise resolve；
 * 路由内副作用 emit（session/start 的 applyStartOutcome → sessionUpdated）同样
 * 先于结果返回。回归形态：emit 被引入任何异步缓冲（定时器/微任务队列）会让
 * 「快照类读口的结果」先于其前序增量到达渲染层——渲染层 append-only 合并的
 * 前后缀前提被破坏（症状：正文重复）。装配层 emitToRenderer 的同步 send 属
 * Electron 装配面（本测试不可达，由 index.ts 定义处注释声明）。
 */

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeFixture(work: string, reply: (cmd: PaiCommand, pushFrame: (frame: HubFrame) => void) => Reply) {
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  let frameCb: ((frame: HubFrame) => void) | null = null;
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    // hub 语义：同一 stdout 管道先写事件帧后写 response 行——request 处理内同步
    // 推帧（帧分发 → emit 同步落数组），再回命令结果
    request: (command: PaiCommand) => Promise.resolve(reply(command, (frame) => frameCb?.(frame))),
    onFrame: (cb: (frame: HubFrame) => void) => {
      frameCb = cb;
      return () => undefined;
    },
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(undefined),
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
      return port;
    },
  });
  const settings = createFileSettings(join(work, 'settings.json'), emptyKeyStore);
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore: emptyKeyStore,
    audit: () => undefined,
    agentDirFiles: createAgentDirFiles(agentDir),
    agentDefinitions: createAgentDefinitionsStore(agentDir),
    revealPath: () => undefined,
  });
  return { runtime, routes, events };
}

type Reply = HostCommandOutcome;

describe('事件/响应单一全序（emit 同步直发）', () => {
  test('快照读口：response 前序事件帧的 emit 先于 invoke resolve（正文重复症状的结构防线）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-emit-order-'));
    const { runtime, routes, events } = makeFixture(work, (cmd, pushFrame) => {
      if (cmd.type === 'get_entries') {
        // 事件帧先于 response：模拟 hub 把增量写在前、快照结果写在后
        pushFrame({ type: 'event', threadId: 't1', event: { type: 'agent_start' } });
        return { ok: true, data: { entries: [] } };
      }
      return { ok: true, data: {} };
    });
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();

    const outcome = (await routes.invoke('session/entries', { threadId: 't1' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    // invoke resolve 时刻：前序事件已同步 emit（若 emit 被异步缓冲，此处为空 → 假红防线）
    expect(events.some((event) => event.type === 'turnStarted')).toBe(true);
    await runtime.stop();
  });

  test('路由内副作用 emit（session/start → sessionUpdated）先于结果返回', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-emit-order-2'));
    const { runtime, routes, events } = makeFixture(work, (cmd) => {
      if (cmd.type === 'thread/start') {
        return { ok: true, data: { threadId: 't1', cwd: work, sessionPath: null } };
      }
      return { ok: true, data: {} };
    });
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();

    const outcome = (await routes.invoke('session/start', { cwd: work })) as { ok: boolean; data: { threadId: string } };
    expect(outcome.ok).toBe(true);
    expect(events.some((event) => event.type === 'sessionUpdated')).toBe(true);
    await runtime.stop();
  });
});
