import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostDiagnostics, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createPaiRuntime } from '../pai-runtime';
import type { ProviderKeyStore } from '../file-settings';

/**
 * worker 收编终态回归（T29）：thread_parked 必须把视图折叠为 parked——
 * 症状「worker 被 15 分钟闲置回收后侧栏仍显示 live 直到重启对账」。
 * 常驻链：注册表 keepalive 行在会话 live 化时向 hub re-assert。
 */

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeFixture() {
  const work = mkdtempSync(join(tmpdir(), 'pai-parked-'));
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  let frameCb: ((frame: HubFrame) => void) | null = null;
  const commands: PaiCommand[] = [];
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand) => {
      commands.push(command);
      return Promise.resolve({ ok: true, data: {} } satisfies HostCommandOutcome);
    },
    onFrame: (cb: (frame: HubFrame) => void) => {
      frameCb = cb;
      return () => undefined;
    },
    onPhase: (_cb: (phase: HostPhase) => void) => () => undefined,
    restart: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(undefined),
    diagnostics: (): HostDiagnostics => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
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
  return { runtime, events, commands, pushFrame: (frame: HubFrame) => frameCb?.(frame) };
}

describe('thread_parked 收编终态折叠（症状：回收后侧栏仍 live）', () => {
  test('收编后视图转 parked、streaming 折叠、sessionParked 事件广播', async () => {
    const { runtime, events, pushFrame } = makeFixture();
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    runtime.applyStartOutcome('t1', '/w/app', '/w/app/sessions/t1.jsonl', '标题', Date.now());
    runtime.touchSession('t1', { streaming: true });

    pushFrame({ type: 'thread_parked', threadId: 't1', reason: 'idle' });

    const parked = runtime.sessions().find((session) => session.threadId === 't1');
    expect(parked?.state).toBe('parked');
    expect(parked?.streaming).toBe(false);
    expect(events.some((event) => event.type === 'sessionParked' && event.threadId === 't1' && event.reason === 'idle')).toBe(true);
  });

  test('重复收编幂等（已 parked 不再广播）；心跳帧零事件', async () => {
    const { runtime, events, pushFrame } = makeFixture();
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    runtime.applyStartOutcome('t2', '/w/app', '/w/app/sessions/t2.jsonl', '标题', Date.now());

    pushFrame({ type: 'thread_parked', threadId: 't2', reason: 'manual' });
    const firstCount = events.filter((event) => event.type === 'sessionParked').length;
    pushFrame({ type: 'thread_parked', threadId: 't2', reason: 'idle' });
    pushFrame({ type: 'heartbeat', rssBytes: 1, cpuPercent: 0.5 });

    expect(events.filter((event) => event.type === 'sessionParked').length).toBe(firstCount);
    expect(events.some((event) => event.type === 'host')).toBe(false);
  });
});

describe('常驻链（registry 持久真相 → hub re-assert）', () => {
  test('setSessionKeepalive：未知会话拒绝；落注册表并异步置 hub 标志', async () => {
    const { runtime, commands } = makeFixture();
    await runtime.start();
    expect(runtime.setSessionKeepalive('ghost', true)).toBe('unknown_session');

    runtime.applyStartOutcome('t3', '/w/app', '/w/app/sessions/t3.jsonl', '标题', Date.now());
    expect(runtime.setSessionKeepalive('t3', true)).toBe('ok');
    expect(runtime.registry.get('t3')?.keepalive).toBe(true);

    // hub 置位经异步链发出（等微任务冲刷）
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    const keepaliveCmds = commands.filter((command) => command.type === 'thread/set_keepalive');
    expect(keepaliveCmds.length).toBeGreaterThanOrEqual(1);
  });

  test('applyStartOutcome 对 keepalive 行自动 re-assert（hub 重启后标志重建）', async () => {
    const { runtime, commands } = makeFixture();
    await runtime.start();
    runtime.applyStartOutcome('t4', '/w/app', '/w/app/sessions/t4.jsonl', '标题', Date.now());
    runtime.setSessionKeepalive('t4', true);
    const before = commands.filter((command) => command.type === 'thread/set_keepalive').length;
    // 模拟下一次 live 化（如发消息唤醒）
    runtime.applyStartOutcome('t4', '/w/app', '/w/app/sessions/t4.jsonl', '标题', Date.now());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(commands.filter((command) => command.type === 'thread/set_keepalive').length).toBeGreaterThan(before);
  });
});
