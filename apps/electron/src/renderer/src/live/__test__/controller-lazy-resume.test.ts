import { describe, expect, test } from 'bun:test';

import type { SessionView } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { createLiveStore, type LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/**
 * 懒恢复回归（T16 建立、T27 收窄为「读不唤醒、写才唤醒」）：parked 会话的
 * 选择/bootstrap/回落一律只读激活（零 resume，历史经 host 直读）；resume 只
 * 在写路径发生——发消息兜底（去重、threadId 只信响应、失败不自动重试）、
 * History 打开（hub 无表项必须建表）、trusted 重载串行化。
 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

type ScriptedClient = BridgeClient & {
  calls: Array<{ method: string; params: unknown }>;
  emitToController: (event: unknown) => void;
};

function makeClient(script: (method: string, params: Record<string, unknown>) => Outcome | Promise<Outcome>): ScriptedClient {
  const calls: Array<{ method: string; params: unknown }> = [];
  let listener: ((event: unknown) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      return Promise.resolve(script(method, (params ?? {}) as Record<string, unknown>)).then((outcome) => outcome as never);
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
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

/** start() 需要 bootstrap 载荷（disposed 守卫在 start 前拦截懒恢复续体，与生产时序一致）。 */
const bootstrapOf = (sessions: SessionView[]): Outcome => ({
  ok: true,
  data: { sessions, saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] }, hostPhase: 'ready' },
});

describe('只读激活（T27：读不唤醒）', () => {
  test('症状回归「点开对话即拉起 worker」：selectSession(parked) 零 resume 直接激活，历史经直读水化', async () => {
    const sessions = [sessionView('t2', 'live', '/w/s/t2.jsonl'), sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) =>
      method === 'app/bootstrap' ? bootstrapOf(sessions) : { ok: true, data: { items: [], cursor: null } },
    );
    const store = bootStore(sessions);
    store.getState().setActiveThread('t2');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    controller.selectSession('t1');
    await waitMs(0);

    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('症状回归「所有历史对话报历史加载失败」：hub 表外 parked 会话水化前先 session/register（零 resume）', async () => {
    const sessions = [sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/register') return { ok: true, data: sessionView('t1', 'parked', '/w/s/t1.jsonl') };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    await controller.ensureHydrated('t1');
    await waitMs(0);

    const methods = client.calls.map((call) => call.method);
    // 纳管在水化链头部（冷启动 hub 表空，读命令按 threadId 寻址回 Unknown）
    expect(methods.indexOf('session/register')).toBe(0);
    expect(methods.indexOf('session/entries')).toBe(1);
    expect(methods).toContain('session/state');
    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().threads['t1']?.hydrateFailed).toBe(false);
  });

  test('症状回归「bootstrap 自动选中即唤醒」：启动选中的 parked 会话零 resume', async () => {
    const client = makeClient((method) => {
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

    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().notices).toHaveLength(0);
  });

  test('症状回归「host 重启回落自动唤回」：sessionUpdated(parked) 命中活跃会话零 resume', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'live', '/w/s/t1.jsonl')]);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start().catch(() => undefined);
    client.calls.length = 0;

    client.emitToController({ type: 'sessionUpdated', session: sessionView('t1', 'parked', '/w/s/t1.jsonl') });
    await waitMs(0);
    expect(resumeCalls(client)).toBe(0);
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

describe('写路径兜底（T16 遗产 + T27 收窄）', () => {
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

  test('submitDraft 于 parked 会话：resume 失败返回 resume_failed 且不发 prompt', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: false, reason: 'timeout' } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '你好');

    expect(reason).toBe('resume_failed');
    expect(client.calls.some((call) => call.method === 'session/prompt')).toBe(false);
  });

  test('在途去重（写路径）：响应未落前重复发消息只发一次 resume', async () => {
    let releaseResume: (outcome: Outcome) => void = () => undefined;
    const gate = new Promise<Outcome>((resolve) => {
      releaseResume = resolve;
    });
    const client = makeClient((method) => (method === 'session/resume' ? gate : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    void controller.submitDraft('t1', '第一条');
    await waitMs(0);
    void controller.submitDraft('t1', '第二条');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);

    releaseResume({ ok: true, data: { threadId: 't1' } });
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().activeThreadId).toBe('t1');
  });

  test('乐观登记：resume 响应先于 sessionUpdated(live) 事件时，重复发消息不再发 resume；host restarting 清空登记', async () => {
    const sessions = [sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'session/resume') return { ok: true, data: { threadId: 't1' } };
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    const controller = createLiveController(client, store);
    await controller.start();
    await waitMs(0);
    expect(resumeCalls(client)).toBe(0);

    // 事件尚未折叠（store 仍 parked）：首次发消息 resume 一次；乐观登记窗口内重复投递不重发
    await controller.submitDraft('t1', '一');
    await controller.submitDraft('t1', '二');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);

    // host 重启：乐观登记失效 → 再次发消息会重新 resume
    client.emitToController({ type: 'host', phase: 'restarting' });
    await controller.submitDraft('t1', '三');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(2);
  });

  test('submitDraft 空消息于 parked → 零 resume（兜底前置条件）', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '   ');

    expect(reason).toBe('empty_message');
    expect(resumeCalls(client)).toBe(0);
  });

  test('bridge 不可用时 parked 会话的 submitDraft 静默返回 bridge_unavailable（不发 resume）', async () => {
    const client = makeClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't1' } } : { ok: true, data: null }));
    (client as { available: boolean }).available = false;
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '你好');

    expect(reason).toBe('bridge_unavailable');
    expect(resumeCalls(client)).toBe(0);
  });

  test('唤醒完成不劫持在途选择：submitDraft 唤醒在途时用户显式切换 → 换 id 只投递不激活', async () => {
    let releaseResume: (outcome: Outcome) => void = () => undefined;
    const gate = new Promise<Outcome>((resolve) => {
      releaseResume = resolve;
    });
    const sessions = [sessionView('t2', 'live', '/w/s/t2.jsonl'), sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'session/resume') return gate;
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);

    void controller.submitDraft('t1', '你好');
    await waitMs(0);
    controller.selectSession('t2'); // 在途切换走（显式选择优先于换 id 激活）
    releaseResume({ ok: true, data: { threadId: 't9' } });
    await waitMs(0);

    expect(resumeCalls(client)).toBe(1);
    expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({ threadId: 't9' });
    expect(store.getState().activeThreadId).toBe('t2');
  });
});

describe('重载冷启动水化（事件流不重放历史）', () => {
  test('症状回归「刷新页面当前会话变空态」：live 会话 ensureHydrated 同样全量拉取条目', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const items = [
      { kind: 'user', id: 'u1', text: '问', origin: 'user', images: [], at: 1_000 } as never,
      { kind: 'assistant', id: 'a1', text: '答', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 1_001 } as never,
    ];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/entries') return { ok: true, data: { items, cursor: 'c1' } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    // 渲染层重载后 store 全新（hydrated=false）：live 会话的历史只能拉取补齐
    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(client.calls.some((call) => call.method === 'session/entries')).toBe(true);
    expect((store.getState().threads['t1']?.items ?? []).length).toBeGreaterThan(0);
    expect(store.getState().threads['t1']?.hydrateFailed).toBe(false);
  });

  test('症状回归「刷新后在途轮只剩最新输出」：重载水化把本轮已落盘前缀留在视图内', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const items = [
      { kind: 'user', id: 'u1', text: '看一下天气', origin: 'user', images: [], at: 1_000 } as never,
      { kind: 'assistant', id: 'a1', text: '前半', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 1_001 } as never,
    ];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/entries') return { ok: true, data: { items, cursor: 'a1' } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    // 重载后事件流续上：重载前的增量随旧渲染层消亡，视图里只剩重载后的增量
    client.emitToController({ type: 'messageStarted', threadId: 't1', messageId: 'm2', at: 2 });
    client.emitToController({ type: 'textDelta', threadId: 't1', messageId: 'm2', delta: '后半' });
    await controller.ensureHydrated('t1');
    await waitMs(0);

    const thread = store.getState().threads['t1'];
    const texts = (thread?.items ?? []).flatMap((item) =>
      item.kind === 'turn' ? item.turn.blocks.map((block) => (block.kind === 'text' ? block.text : '')) : [],
    );
    expect(texts.join('\n')).toContain('前半');
    expect(texts.join('\n')).toContain('后半');
  });

  test('live 会话水化不走纳管（零 register 零 resume——表项已在 hub）', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(client.calls.some((call) => call.method === 'session/register')).toBe(false);
    expect(resumeCalls(client)).toBe(0);
  });
});

describe('History 打开与占位收敛', () => {
  test('同路径已 live → 直接激活零 resume（不撞 hub 双开守卫）', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t2', 'live', '/w/s/t2.jsonl')]);
    const controller = createLiveController(client, store);

    const opened = await controller.openSavedSession('/w/s/t2.jsonl');

    expect(opened).toBe(true);
    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().activeThreadId).toBe('t2');
  });

  test('症状回归「History 打开 parked 占位也拉起 worker」：只读激活走纳管直读链，零 resume', async () => {
    const sessions = [sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/register') return { ok: true, data: sessionView('t1', 'parked', '/w/s/t1.jsonl') };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    const controller = createLiveController(client, store);
    await controller.start();
    client.calls.length = 0;

    const opened = await controller.openSavedSession('/w/s/t1.jsonl');

    expect(opened).toBe(true);
    expect(resumeCalls(client)).toBe(0);
    expect(store.getState().activeThreadId).toBe('t1');
    // 水化走 register → entries 纳管链
    expect(client.calls.some((call) => call.method === 'session/register')).toBe(true);
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

describe('写路径串行化（trusted 重载链）', () => {
  test('reloadSessionTrusted 串行化：先等在途唤醒结算，再 stop(保行) + resume(trusted)', async () => {
    const order: string[] = [];
    let releaseWake: (outcome: Outcome) => void = () => undefined;
    const wakeGate = new Promise<Outcome>((resolve) => {
      releaseWake = resolve;
    });
    let wakeSettled = false;
    const sessions = [sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'session/resume') {
        return wakeSettled
          ? { ok: true, data: { threadId: 't1' } }
          : wakeGate.finally(() => {
              wakeSettled = true;
            });
      }
      if (method === 'session/stop') {
        order.push('stop');
        return { ok: true, data: null };
      }
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    const controller = createLiveController(client, store);
    await controller.start();
    // 在途唤醒由写路径（发消息）制造——读路径不再唤醒（T27）
    void controller.submitDraft('t1', '制造在途唤醒');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);
    client.calls.length = 0;
    order.push('toggle');

    const reloaded = controller.reloadSessionTrusted('t1', true);
    await waitMs(0);
    expect(resumeCalls(client)).toBe(0); // 在途唤醒结算前不发新 resume（trusted 分歧串行化）
    releaseWake({ ok: true, data: { threadId: 't1' } });
    expect(await reloaded).toBe(true);

    const resumeInvokes = client.calls.filter((call) => call.method === 'session/resume');
    expect(resumeInvokes.length).toBe(1);
    expect(resumeInvokes[0]?.params).toMatchObject({ sessionPath: '/w/s/t1.jsonl', trusted: true });
    expect(order).toEqual(['toggle', 'stop']);
    expect(client.calls.find((call) => call.method === 'session/stop')?.params).toMatchObject({ threadId: 't1', remove: false });
  });

  test('closeSession 携带 remove:true（用户关闭删行语义）', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'live', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    await controller.closeSession('t1');

    expect(client.calls.find((call) => call.method === 'session/stop')?.params).toMatchObject({ threadId: 't1', remove: true });
  });
});
