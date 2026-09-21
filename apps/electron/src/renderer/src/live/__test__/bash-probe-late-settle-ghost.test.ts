import { describe, expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';
import type { InflightView } from '@paiapp/contracts';

/**
 * 对抗审查红测 A：bash 收尾探测的在途 invoke 无法被 sessionRemoved 取消，
 * onSettled 无条件写 store.bashSettled，而 bashSettled 用 threadOf 兜底建行——
 * 已被 sessionRemoved 修剪的线程在 threads 表中复活（幽灵线程）。
 *
 * 期望行为：sessionRemoved 之后，threads 表不得再出现该 threadId。
 * 当前实现红：threads['t1'] 被复活。
 */

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sessionView(threadId: string) {
  return {
    threadId,
    cwd: '/w',
    sessionPath: `/w/${threadId}.jsonl`,
    title: 't',
    state: 'live' as const,
    streaming: false,
    model: null,
    thinkingLevel: null,
    lastActivityAt: 1,
  };
}

function makeClient(inflightDeferred: Deferred<{ ok: true; data: InflightView } | { ok: false; error: { kind: string } }>) {
  let listener: ((event: unknown) => void) | undefined;
  const client: BridgeClient & { emitToController: (event: unknown) => void } = {
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: async (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({
          ok: true,
          data: {
            sessions: [],
            saved: [],
            models: [],
            providers: [],
            preferences: {
              defaultModel: null,
              onboarded: true,
              projectModels: {},
              pinnedSessions: [],
              trustedDefault: false,
              hiddenProjects: [],
              idleRecycleMinutes: 5,
              archivedSessions: [],
            },
            hostPhase: 'ready',
          },
        } as never);
      }
      if (method === 'session/inflight') return inflightDeferred.promise as never;
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } } as never;
      return { ok: true, data: null } as never;
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  };
  return client;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const emptyInflight: InflightView = { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null };

describe('红测 A：bash 收尾探测在途 × sessionRemoved → 幽灵线程复活', () => {
  test('探测在途时移除会话，迟到 onSettled 不得把 threads[threadId] 复活', async () => {
    const inflightDeferred = deferred<{ ok: true; data: InflightView } | { ok: false; error: { kind: string } }>();
    const store = createLiveStore();
    const client = makeClient(inflightDeferred);
    const controller = createLiveController(client, store);
    await controller.start();

    const threadId = 't1';
    store.getState().applyEvent({ type: 'sessionUpdated', session: sessionView(threadId) }, Date.now());
    store.getState().setActiveThread(threadId);

    // 直执行 bash 输出事件 → 点亮横幅 + 排收尾探测（默认 700ms 后探测）
    client.emitToController({ type: 'bashOutput', threadId, delta: 'hello', truncated: false });
    expect(store.getState().threads[threadId]?.bashRunning).toBe(true);

    // 等 probe 定时器到期、session/inflight invoke 挂起在途
    await wait(760);

    // 会话移除（用户关闭/归档）：threads 键应随行回收
    client.emitToController({ type: 'sessionRemoved', threadId });
    expect(store.getState().sessions[threadId]).toBeUndefined();
    expect(store.getState().threads[threadId]).toBeUndefined();

    // 在途探测此刻才回包：读口说无在途 bash → onSettled → store.bashSettled(threadId)
    inflightDeferred.resolve({ ok: true, data: emptyInflight });
    await wait(20);

    // 期望：被移除线程不得在 threads 表复活（与 store.hydrate 的幽灵守卫同口径）
    expect(store.getState().threads[threadId]).toBeUndefined();
    controller.dispose();
  });
});
