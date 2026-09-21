import { describe, expect, test } from 'bun:test';

import type { SessionView } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { createLazyResume } from '../lazy-resume';
import { createLiveStore, type LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/**
 * 懒恢复回归（T16 建立、T27 收窄为「读不唤醒」）：parked 会话的选择/bootstrap/
 * 回落一律只读激活（零 resume，历史经 host 直读）；发消息的唤醒与 unknown_thread
 * 自愈已随发送管线主进程化（T41 R1，回归见 main __test__/api-routes.session.test.ts），
 * 渲染层 resume 只剩显式入口——History 打开（hub 无表项必须建表）、重开链、
 * trusted 重载串行化；在途去重/乐观登记机器在 lazy-resume 模块单测覆盖。
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

describe('写路径兜底（显式恢复入口 + 主进程化后的薄投递）', () => {
  test('submitDraft 薄调用：不发 session/resume（parked 懒唤醒居主进程 session/prompt 管线）', async () => {
    const client = makeClient((method) => (method === 'session/prompt' ? { ok: true, data: null } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '你好');

    expect(reason).toBeNull();
    expect(client.calls.some((call) => call.method === 'session/resume')).toBe(false);
    expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({ threadId: 't1', message: '你好' });
  });

  test('submitDraft 空消息 → 本地 empty_message 拦截（零 IPC）', async () => {
    const client = makeClient(() => ({ ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const controller = createLiveController(client, store);

    const reason = await controller.submitDraft('t1', '   ');

    expect(reason).toBe('empty_message');
    expect(client.calls).toEqual([]);
  });
});

describe('lazy-resume 机器（在途去重/乐观登记——显式恢复入口共用）', () => {
  function unitClient(script: (method: string) => Outcome | Promise<Outcome>): BridgeClient & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      available: true,
      invoke: (method) => {
        calls.push(method);
        return Promise.resolve(script(method)).then((outcome) => outcome as never);
      },
      subscribe: () => () => undefined,
    };
  }

  test('resumeByPath 在途去重：同参数并发只发一次 resume；trusted 分歧串行结算后重发', async () => {
    let release: (outcome: Outcome) => void = () => undefined;
    const gate = new Promise<Outcome>((resolve) => {
      release = resolve;
    });
    const client = unitClient((method) => (method === 'session/resume' ? gate : { ok: true, data: null }));
    const lazy = createLazyResume(client, createLiveStore());

    const first = lazy.resumeByPath('/w/s/t1.jsonl');
    const second = lazy.resumeByPath('/w/s/t1.jsonl');
    release({ ok: true, data: { threadId: 't1' } });
    expect(await first).toBe('t1');
    expect(await second).toBe('t1');
    expect(client.calls.filter((method) => method === 'session/resume')).toHaveLength(1);

    // trusted 分歧：不静默降级信任态——首唤醒结算后以新参数再发
    const diverged = lazy.resumeByPath('/w/s/t1.jsonl', true);
    expect(await diverged).toBe('t1');
    expect(client.calls.filter((method) => method === 'session/resume')).toHaveLength(2);
  });

  test('ensureLiveSession 乐观登记：resume 已应答而 sessionUpdated 事件未折叠的窗口内不再发 resume；invalidate 后重发', async () => {
    const client = unitClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't9' } } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const lazy = createLazyResume(client, store);

    expect(await lazy.ensureLiveSession('t1')).toBe('t9');
    // 事件未折叠（store 仍 parked）：乐观登记窗口内重复唤醒直取已恢复 id
    expect(await lazy.ensureLiveSession('t1')).toBe('t9');
    expect(client.calls.filter((method) => method === 'session/resume')).toHaveLength(1);

    // host 进程代际切换：乐观登记失效，重新 resume
    lazy.invalidate();
    expect(await lazy.ensureLiveSession('t1')).toBe('t9');
    expect(client.calls.filter((method) => method === 'session/resume')).toHaveLength(2);
  });

  test('ensureLiveSession 非 parked 原样返回（live/dead 由 hub 命令自愈）；无会话文件的空占位不可恢复', async () => {
    const client = unitClient(() => ({ ok: true, data: { threadId: 'x' } }));
    const store = bootStore([sessionView('t1', 'live', '/w/s/t1.jsonl'), sessionView('t2', 'parked', null)]);
    const lazy = createLazyResume(client, store);

    expect(await lazy.ensureLiveSession('t1')).toBe('t1');
    expect(await lazy.ensureLiveSession('ghost')).toBe('ghost');
    expect(await lazy.ensureLiveSession('t2')).toBeNull();
    expect(client.calls).toEqual([]);
  });

  test('discardResumed：stop 后清该路径乐观登记（旧 id 已 dispose）', async () => {
    const client = unitClient((method) => (method === 'session/resume' ? { ok: true, data: { threadId: 't9' } } : { ok: true, data: null }));
    const store = bootStore([sessionView('t1', 'parked', '/w/s/t1.jsonl')]);
    const lazy = createLazyResume(client, store);
    expect(await lazy.ensureLiveSession('t1')).toBe('t9');
    lazy.discardResumed('/w/s/t1.jsonl');
    expect(await lazy.ensureLiveSession('t1')).toBe('t9');
    expect(client.calls.filter((method) => method === 'session/resume')).toHaveLength(2);
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
    const client = makeClient((method) => (method === 'session/resume' ? { ok: false, error: { kind: 'session_unreadable' } } : { ok: true, data: null }));
    const store = createLiveStore();
    const controller = createLiveController(client, store);

    const opened = await controller.openSavedSession('/w/s/ghost.jsonl');

    expect(opened).toBe(false);
    expect(resumeCalls(client)).toBe(1);
    expect(store.getState().notices.map((notice) => notice.text)).toContain('会话恢复失败，请重试。');
  });
});

describe('写路径串行化（trusted 重载链）', () => {
  test('reloadSessionTrusted 串行化：先等在途恢复结算（reopen 链制造），再 stop(保行) + resume(trusted)', async () => {
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
    // 在途恢复由重开链制造（发消息的唤醒已主进程化——渲染层在途 resume 只剩显式入口）
    void controller.reopenSession('t1');
    await waitMs(0);
    expect(resumeCalls(client)).toBe(1);
    client.calls.length = 0;
    order.length = 0;
    order.push('toggle');

    const reloaded = controller.reloadSessionTrusted('t1', true);
    await waitMs(0);
    expect(resumeCalls(client)).toBe(0); // 在途恢复结算前不发新 resume（trusted 分歧串行化）
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
