import { describe, expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';
import type { InflightView, PendingDialogView, SubagentSnapshotView, ThreadStateView } from '@paiapp/contracts';

/**
 * 对抗审查红测 C：只读收敛链（converge）的 Promise.all 在途期间会话被移除，
 * 迟到的读口回包仍无条件写 store：
 * - hydrateSubagents / applyEvent(queueChanged) 用 threadOf 兜底建行 → threads 表复活幽灵线程；
 * - hydrateDialogs 只增不删 → 已随 sessionRemoved 收走的弹窗复活（死会话弹窗再弹 UI）。
 * store.hydrate 有幽灵守卫，但同批其余写入口没有。
 *
 * 期望行为：sessionRemoved 之后，threads 表与 dialogs 队列不得再出现该线程的任何状态。
 * 当前实现红：threads['t1'] 复活、dialogs 复活。
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
    streaming: true,
    model: null,
    thinkingLevel: null,
    lastActivityAt: 1,
  };
}

const emptyInflight: InflightView = { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null };
const snapshotAgents: SubagentSnapshotView[] = [{ agentId: 'a1', agentType: 'explore', work: 'w', status: 'running' }];
const snapshotDialogs: PendingDialogView[] = [
  { requestId: 'req-1', threadId: 't1', method: 'confirm', payload: { tool: 'Bash', summary: 'rm -rf' } },
];
const stateView: ThreadStateView = {
  model: null,
  isStreaming: true,
  isCompacting: false,
  sessionName: null,
  messageCount: 1,
  queue: { steering: [], followUp: [] },
};

function makeClient(gates: {
  inflight: Deferred<{ ok: true; data: InflightView }>;
  subagents: Deferred<{ ok: true; data: { subagents: SubagentSnapshotView[] } }>;
  dialogs: Deferred<{ ok: true; data: { dialogs: PendingDialogView[] } }>;
  state: Deferred<{ ok: true; data: ThreadStateView }>;
}) {
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
      if (method === 'session/inflight') return gates.inflight.promise as never;
      if (method === 'session/subagents') return gates.subagents.promise as never;
      if (method === 'session/pendingDialogs') return gates.dialogs.promise as never;
      if (method === 'session/state') return gates.state.promise as never;
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

describe('红测 C：converge 在途 × sessionRemoved → 幽灵线程与死会话弹窗复活', () => {
  test('读口四路在途时移除会话，迟到回包不得写回 threads/dialogs', async () => {
    const gates = {
      inflight: deferred<{ ok: true; data: InflightView }>(),
      subagents: deferred<{ ok: true; data: { subagents: SubagentSnapshotView[] } }>(),
      dialogs: deferred<{ ok: true; data: { dialogs: PendingDialogView[] } }>(),
      state: deferred<{ ok: true; data: ThreadStateView }>(),
    };
    const store = createLiveStore();
    const client = makeClient(gates);
    const controller = createLiveController(client, store);
    await controller.start();

    const threadId = 't1';
    store.getState().applyEvent({ type: 'sessionUpdated', session: sessionView(threadId) }, Date.now());
    store.getState().setActiveThread(threadId);

    // live 会话冷启动水化 → converge：四路读口全部在途
    const hydrating = controller.ensureHydrated(threadId);
    await wait(10);

    // 会话在读取在途时被移除：threads/dialogs 键随行回收
    client.emitToController({ type: 'sessionRemoved', threadId });
    expect(store.getState().sessions[threadId]).toBeUndefined();
    expect(store.getState().threads[threadId]).toBeUndefined();

    // 迟到的读口回包（快照读取于移除之前，内容仍是旧事实）
    gates.inflight.resolve({ ok: true, data: emptyInflight });
    gates.subagents.resolve({ ok: true, data: { subagents: snapshotAgents } });
    gates.dialogs.resolve({ ok: true, data: { dialogs: snapshotDialogs } });
    gates.state.resolve({ ok: true, data: stateView });
    await hydrating.catch(() => undefined);
    await wait(10);

    // 期望：被移除线程的任何状态不得复活
    expect(store.getState().threads[threadId]).toBeUndefined();
    expect(store.getState().dialogs.some((dialog) => dialog.threadId === threadId)).toBe(false);
    controller.dispose();
  });
});
