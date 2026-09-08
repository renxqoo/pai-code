import { describe, expect, test } from 'bun:test';

import type { SessionView } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { createLiveStore, type LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/**
 * 懒恢复回归（T16）：parked 占位的按需 resume——去重（同 sessionPath 在途至多一次）、
 * 失败不自动重试（通知条 + 占位保留）、threadId 只信响应、发消息前兜底、
 * bootstrap 自动选中唤醒、host 重启后活跃会话自动唤回、History 打开与占位收敛。
 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

type ScriptedClient = BridgeClient & {
  calls: Array<{ method: string; params: unknown }>;
  emitToController: (event: unknown) => void;
};

function makeClient(script: (method: string, params: Record<string, unknown>) => Outcome | Promise<Outcome>): ScriptedClient {
  const calls: Array<{ method: string; params: unknown }> = [];
  let listener: ((events: readonly unknown[]) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.([event]),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      return Promise.resolve(script(method, (params ?? {}) as Record<string, unknown>)).then((outcome) => outcome as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
}

function sessionView(threadId: string, state: SessionView['state'], sessionPath: string | null): SessionView {
  return { threadId, cwd: '/w', sessionPath, title: `标题-${threadId}`, state, streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 };
}

function bootStore(sessions: SessionView[]): LiveStore {
  const store = createLiveStore();
  store.getState().bootstrap({
    sessions,
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] },
    hostPhase: 'ready',
  } as never);
  return store;
}

const resumeCalls = (client: ScriptedClient): number => client.calls.filter((call) => call.method === 'session/resume').length;

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** start() 需要 bootstrap 载荷（ disposed 守卫在 start 前拦截懒恢复续体，与生产时序一致）。 */
const bootstrapOf = (sessions: SessionView[]): Outcome => ({
  ok: true,
  data: { sessions, saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] }, hostPhase: 'ready' },
});

describe('懒恢复：选择与去重', () => {
  test('selectSession(parked) → 恰一次 resume，成功后以响应 id 激活', async () => {
    const sessions = [sessionView('t2', 'live', '/w/s/t2.jsonl'), sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) =>
      method === 'session/resume' ? { ok: true, data: { threadId: 't9' } } : method === 'app/bootstrap' ? bootstrapOf(sessions) : { ok: true, data: null },
    );
    const store = bootStore(sessions);
    store.getState().setActiveThread('t2');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    controller.selectSession('t1');
    await waitMs(0);

    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().activeThreadId).toBe('t9');
  });

  test('在途去重：响应未落前重复点击同一占位只发一次 resume', async () => {
    let releaseResume: (outcome: Outcome) => void = () => undefined;
    const gate = new Promise<Outcome>((resolve) => {
      releaseResume = resolve;
    });
    const sessions = [sessionView('t2', 'live', '/w/s/t2.jsonl'), sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'session/resume') return gate;
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t2');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    controller.selectSession('t1');
    controller.selectSession('t1');
    controller.selectSession('t1');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);

    releaseResume({ ok: true, data: { threadId: 't1' } });
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('selectSession(live) 直接激活，零 resume', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t2', 'live', '/w/s/t2.jsonl')]);
    const controller = createLiveController(client, store);

    controller.selectSession('t2');
    await waitMs(0);

    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().activeThreadId).toBe('t2');
  });
});

describe('懒恢复：失败面（不自动重试）', () => {
  test('resume 失败 → 通知条 + 活跃不变 + 占位保留；手动重试（再次选择）可成功', async () => {
    let fail = true;
    const sessions = [sessionView('t2', 'live', '/w/s/t2.jsonl'), sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method !== 'session/resume') return { ok: true, data: null };
      return fail ? { ok: false, reason: 'session_not_found' } : { ok: true, data: { threadId: 't1' } };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t2');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    controller.selectSession('t1');
    await waitMs(0);
    expect(store.getState().notices.map((notice) => notice.text)).toContain('会话恢复失败，请重试。');
    expect(store.getState().activeThreadId).toBe('t2');
    expect(store.getState().sessions['t1']?.state).toBe('parked');
    expect(resumeCalls(client)).toBe(1);

    // 手动重试 = 再次点击
    fail = false;
    controller.selectSession('t1');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(2);
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('submitDraft 于 parked 会话：resume 失败返回 resume_failed 且不发 prompt', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: false, reason: 'timeout' } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '你好');

    expect(reason).toBe('resume_failed');
    expect(client.calls.some((call) => call.method === 'session/prompt')).toBe(false);
  });
});

describe('懒恢复：发消息前兜底', () => {
  test('submitDraft(parked) → 先 resume 后 prompt，prompt 用响应 threadId', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't9' } } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '你好');

    expect(reason).toBeNull();
    const order = client.calls.map((call) => call.method);
    expect(order.indexOf('session/resume')).toBeLessThan(order.indexOf('session/prompt'));
    expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({ threadId: 't9', message: '你好' });
    // 换 id 时同步激活（旧占位由主进程 sessionRemoved 清出）
    expect(store.getState().activeThreadId).toBe('t9');
  });
});

describe('懒恢复：启动与 host 重启链路', () => {
  test('bootstrap 自动选中的 parked 会话自动唤醒；失败发通知不崩', async () => {
    const client = makeClient((method) => {
      if (method === 'session/resume') return { ok: false, reason: 'timeout' };
      if (method === 'app/bootstrap') {
        return {
          ok: true,
          data: { sessions: [sessionView('t1', 'parked', '/w/s/t1.jsonl')], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] }, hostPhase: 'ready' },
        };
      }
      return { ok: true, data: null };
    });
    const store = createLiveStore();
    const controller = createLiveController(client, store);

    await controller.start();
    await waitMs(0);

    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().notices.map((notice) => notice.text)).toContain('会话恢复失败，请重试。');
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('sessionUpdated(parked) 命中活跃会话 → 自动唤回；非活跃不打扰', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't1' } } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'live', '/w/s/t1.jsonl'), sessionView('t2', 'parked', '/w/s/t2.jsonl')]);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start().catch(() => undefined);
    client.calls.length = 0;

    client.emitToController({ type: 'sessionUpdated', session: sessionView('t2', 'parked', '/w/s/t2.jsonl') });
    await waitMs(0);
    expect(resumeCalls(client)).toBe(0);

    client.emitToController({ type: 'sessionUpdated', session: sessionView('t1', 'parked', '/w/s/t1.jsonl') });
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);
  });
});

describe('懒恢复：History 打开与占位收敛', () => {
  test('同路径已 live → 直接激活零 resume（不撞 hub 双开守卫）', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t2', 'live', '/w/s/t2.jsonl')]);
    const controller = createLiveController(client, store);

    const opened = await controller.openSavedSession('/w/s/t2.jsonl');

    expect(opened).toBe(true);
    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().activeThreadId).toBe('t2');
  });

  test('同路径 parked 占位 → 走 resume 去重通路后激活', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't1' } } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const opened = await controller.openSavedSession('/w/s/t1.jsonl');

    expect(opened).toBe(true);
    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().activeThreadId).toBe('t1');
    // 激活后水化走 session/entries
    expect(client.calls.some((call) => call.method === 'session/entries')).toBe(true);
  });

  test('未知路径 → 直接 resume；失败返回 false 并通知', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: false, reason: 'session_not_found' } : { ok: true, data: null }));
    const store = createLiveStore();
    const controller = createLiveController(client, store);

    const opened = await controller.openSavedSession('/w/s/ghost.jsonl');

    expect(opened).toBe(false);
    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().notices.map((notice) => notice.text)).toContain('会话恢复失败，请重试。');
  });
});
