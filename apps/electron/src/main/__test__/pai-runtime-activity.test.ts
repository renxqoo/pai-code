import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createPaiRuntime } from '../pai-runtime';
import type { ProviderKeyStore } from '../file-settings';

/**
 * 会话活动时间语义回归（T5 §修复）：lastActivityAt 只随会话活动推进
 * （新建/fork/turn）；恢复/改名不推进。注册表 updatedAt 是它的持久镜像，
 * 侧栏排序与相对时间标签（「刚刚」）都以此为准。
 */

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeFixture() {
  const work = mkdtempSync(join(tmpdir(), 'pai-activity-'));
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  let frameCb: ((frame: HubFrame) => void) | null = null;
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (_command: PaiCommand) => Promise.resolve({ ok: true, data: {} } satisfies HostCommandOutcome),
    onFrame: (cb: (frame: HubFrame) => void) => {
      frameCb = cb;
      return () => undefined;
    },
    onPhase: (_cb: (phase: HostPhase) => void) => () => undefined,
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
  return {
    runtime,
    events,
    pushFrame: (frame: HubFrame) => frameCb?.(frame),
  };
}

describe('会话活动时间语义（T5 §修复）', () => {
  test('症状回归：turn 活动推进内存视图与注册表行（agent_start → agent_settled 同步落库）', async () => {
    const { runtime, pushFrame } = makeFixture();
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    runtime.applyStartOutcome('t1', '/w/app', '/w/app/sessions/t1.jsonl', '标题', 5_000);
    expect(runtime.registry.get('t1')?.updatedAt).toBe(5_000);

    pushFrame({ type: 'event', threadId: 't1', name: 'turn/start', payload: { ts: Date.now() } });
    const startedAt = runtime.registry.get('t1')?.updatedAt ?? 0;
    expect(startedAt).toBeGreaterThan(5_000);
    expect(startedAt).toBe(runtime.sessions().find((session) => session.threadId === 't1')?.lastActivityAt);

    pushFrame({ type: 'event', threadId: 't1', name: 'settled', payload: { ok: true } });
    expect(runtime.registry.get('t1')?.updatedAt ?? 0).toBeGreaterThanOrEqual(startedAt);
    expect(runtime.sessions().find((session) => session.threadId === 't1')?.streaming).toBe(false);
  });

  test('症状回归：改名不推进活动时间（rename 落库保留 updatedAt）', async () => {
    const { runtime } = makeFixture();
    await runtime.start();
    runtime.applyStartOutcome('t1', '/w/app', '/w/app/sessions/t1.jsonl', '旧名', 5_000);

    runtime.renameSession('t1', '新名');

    expect(runtime.registry.get('t1')).toMatchObject({ title: '新名', updatedAt: 5_000 });
    expect(runtime.sessions().find((session) => session.threadId === 't1')?.lastActivityAt).toBe(5_000);
  });

  test('turnSettled 无流式镜像时不推进（去重守卫：孤立 settle 不是新活动）', async () => {
    const { runtime, pushFrame } = makeFixture();
    await runtime.start();
    runtime.applyStartOutcome('t1', '/w/app', '/w/app/sessions/t1.jsonl', '标题', 5_000);

    pushFrame({ type: 'event', threadId: 't1', name: 'settled', payload: { ok: true } });

    expect(runtime.registry.get('t1')?.updatedAt).toBe(5_000);
  });
});
