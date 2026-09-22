import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createPaiRuntime } from '../pai-runtime';
import type { ProviderKeyStore } from '../file-settings';

/**
 * 队列镜像解析回归：agent/inbox/spliced 结构信号 → get_state 拉取 → queueChanged
 * 携带条目（{id, text}——单条队列命令的寻址键）；垃圾条目（缺 id/text）防御过滤。
 */

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeFixture(getStateData: unknown) {
  const work = mkdtempSync(join(tmpdir(), 'pai-queue-mirror-'));
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const events: UiEvent[] = [];
  let frameCb: ((frame: HubFrame) => void) | null = null;
  const requests: PaiCommand[] = [];
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand) => {
      requests.push(command);
      return Promise.resolve({ ok: true, data: getStateData } satisfies HostCommandOutcome);
    },
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
    requests,
    pushFrame: (frame: HubFrame) => frameCb?.(frame),
  };
}

async function waitQueueMirrorSettled(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('队列镜像解析（agent/inbox/spliced → get_state → queueChanged）', () => {
  test('queueChanged 携带条目 id+text（queue/drop、queue/send_now 寻址键）；垃圾条目过滤', async () => {
    const { runtime, events, requests, pushFrame } = makeFixture({
      queue: {
        steering: [{ id: 's1', text: '插一句' }, { text: '缺id' }, 3],
        followUp: [{ id: 'f1', text: '排队的消息' }, { id: '', text: '空id' }],
      },
    });
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    pushFrame({ type: 'event', threadId: 't1', name: 'agent/inbox/spliced', payload: { op: 'insert' } } as unknown as HubFrame);
    await waitQueueMirrorSettled();
    expect(requests.some((command) => command.type === 'get_state')).toBe(true);
    const queueChanged = events.find((event) => event.type === 'queueChanged') as Extract<UiEvent, { type: 'queueChanged' }> | undefined;
    expect(queueChanged).toBeDefined();
    expect(queueChanged?.threadId).toBe('t1');
    expect(queueChanged?.steering).toEqual([{ id: 's1', text: '插一句' }]);
    expect(queueChanged?.followUp).toEqual([{ id: 'f1', text: '排队的消息' }]);
  });

  test('queue 字段缺失/垃圾形状 → 两个空数组（空形态降级，不崩溃）', async () => {
    const { runtime, events, pushFrame } = makeFixture({ other: true });
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    pushFrame({ type: 'event', threadId: 't1', name: 'agent/inbox/spliced', payload: { op: 'claim' } } as unknown as HubFrame);
    await waitQueueMirrorSettled();
    const queueChanged = events.find((event) => event.type === 'queueChanged') as Extract<UiEvent, { type: 'queueChanged' }> | undefined;
    expect(queueChanged?.steering).toEqual([]);
    expect(queueChanged?.followUp).toEqual([]);
  });
});
