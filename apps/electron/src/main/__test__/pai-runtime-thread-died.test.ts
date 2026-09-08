import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand, UiEvent } from '@paiapp/contracts';

import { createPaiRuntime } from '../pai-runtime';
import type { ProviderKeyStore } from '../file-settings';

/**
 * worker 死亡终态回归（T17 测试轮）：thread_died 必须折叠 streaming 镜像——
 * 侧栏活动指示直接消费 SessionView.streaming，滞留会让死亡会话永久转圈。
 */

const emptyKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeFixture() {
  const work = mkdtempSync(join(tmpdir(), 'pai-died-'));
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
    logger: { log: () => undefined },
    emit: (event) => events.push(event),
    createHost: (hostDeps) => {
      // 帧处理回调经 createHost deps 注入（port.onFrame 形参不参与本通路）
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

describe('thread_died 死亡终态折叠 streaming', () => {
  test('症状回归：流式中的 worker 死亡后 state=dead 且 streaming=false（侧栏不永久转圈）', async () => {
    const { runtime, events, pushFrame } = makeFixture();
    await runtime.start();
    runtime.markBootstrapped();
    runtime.emitBuffered();
    runtime.applyStartOutcome('t1', '/w/app', '/w/app/sessions/t1.jsonl', '标题');
    runtime.touchSession('t1', { streaming: true });
    const streamingBefore = runtime.sessions().find((session) => session.threadId === 't1');
    expect(streamingBefore?.streaming).toBe(true);

    pushFrame({ type: 'thread_died', threadId: 't1', reason: 'worker crashed' });

    const dead = runtime.sessions().find((session) => session.threadId === 't1');
    expect(dead?.state).toBe('dead');
    expect(dead?.streaming).toBe(false);
    // 终态视图已作为 sessionUpdated 事件广播（渲染层镜像同步折叠）
    const lastUpdate = [...events].reverse().find((event) => event.type === 'sessionUpdated');
    expect(lastUpdate).toBeDefined();
    if (lastUpdate?.type === 'sessionUpdated') {
      expect(lastUpdate.session.state).toBe('dead');
      expect(lastUpdate.session.streaming).toBe(false);
    }
    expect(events.some((event) => event.type === 'sessionDied' && event.threadId === 't1')).toBe(true);
  });
});
