import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/**
 * controller 编排回归（对抗审查 B-P1）：
 * settle 的 120ms 延迟 rebuild 窗口内若新一轮已开始，重建让位（不抹新轮流式现场）。
 */

function stubTimers(): { fire: () => void } {
  const pending: Array<() => void> = [];
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout?: unknown }).setTimeout = ((fn: () => void) => {
    pending.push(fn);
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as never;
  const fire = (): void => {
    (globalThis as { setTimeout?: unknown }).setTimeout = originalSetTimeout;
    for (const fn of pending.splice(0)) fn();
  };
  return { fire };
}

function makeClient(): BridgeClient & { invokes: string[]; emitToController: (event: unknown) => void } {
  const invokes: string[] = [];
  let listener: ((events: readonly unknown[]) => void) | undefined;
  return {
    invokes,
    available: true,
    emitToController: (event: unknown) => listener?.([event]),
    invoke: async (method: string) => {
      invokes.push(method);
      if (method === 'app/bootstrap') {
        return Promise.resolve({
          ok: true,
          data: { sessions: [], saved: [], models: [], providers: [] },
        } as never);
      }
      if (method === 'session/entries') {
        return { ok: true, data: { items: [], cursor: null } } as never;
      }
      if (method === 'session/stats') {
        return { ok: true, data: { contextUsage: null, tokensTotal: 0 } } as never;
      }
      return { ok: true, data: null } as never;
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
}

test('B-P1：settle→rebuild 窗口内新轮开始，重建让位不执行', async () => {
  const timers = stubTimers();
  const store = createLiveStore();
  const client = makeClient();
  const controller = createLiveController(client, store);
  await controller.start();
  const threadId = 't1';
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });

  // 第一轮：开轮 → settle（安排延迟 rebuild）；事件走 controller 订阅入口
  client.emitToController({ type: 'turnStarted', threadId, at: 1 });
  client.emitToController({ type: 'turnSettled', threadId, usage: null });
  // settle 安排的 timer 挂起中，新一轮开始（followUp 自动续轮）
  client.emitToController({ type: 'turnStarted', threadId, at: 3 });

  const entriesBefore = client.invokes.filter((m) => m === 'session/entries').length;
  timers.fire();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

  // 代际守卫：liveTurnId 已变（1→2），本次 rebuild 不应触发全量拉取
  const rebuilds = client.invokes.filter((m) => m === 'session/entries').length - entriesBefore;
  expect(rebuilds).toBe(0);
  expect(store.getState().threads[threadId]?.liveTurnId).not.toBeNull();
  controller.dispose();
});

test('B-P1 对照：无新轮时 rebuild 正常执行', async () => {
  const timers = stubTimers();
  const store = createLiveStore();
  const client = makeClient();
  const controller = createLiveController(client, store);
  await controller.start();
  const threadId = 't1';
  client.emitToController({ type: 'turnStarted', threadId, at: 1 });
  client.emitToController({ type: 'turnSettled', threadId, usage: null });
  const entriesBefore = client.invokes.filter((m) => m === 'session/entries').length;
  timers.fire();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  const rebuilds = client.invokes.filter((m) => m === 'session/entries').length - entriesBefore;
  expect(rebuilds).toBeGreaterThan(0);
  controller.dispose();
});

test('症状回归：StrictMode 双挂载序列（start→dispose→start）下 bootstrap 应答不得丢弃', async () => {
  // 症状：启动永久停留「正在连接 coding agent 宿主」——effect cleanup 若在挂载当帧
  // 立即调用 dispose，两次 start 的 bootstrap 应答全部撞上 disposed 提前返回。
  // 本用例锁定 controller 契约：后继 start 复原 disposed 后，先前在途应答正常落
  // store，bootstrapLoaded 必须置位（渲染层装配 use-live-workspace 依赖此时序）。
  const store = createLiveStore();
  const client = makeClient();
  const controller = createLiveController(client, store);
  const first = controller.start();
  controller.dispose();
  const second = controller.start();
  await Promise.all([first, second]);
  expect(store.getState().bootstrapLoaded).toBe(true);
  controller.dispose();
});

test('症状回归：新建任务页输入 / 无命令面板——fetchCommandPreview 拉取 command/preview，失败空目录降级', async () => {
  // 预会话目录（无 threadId 可寻址）：成功透传 CommandView[]；宿主/桥失败不抛出，
  // 空数组降级（`/` 触发不启用，@ 文件补全不受影响）。
  const store = createLiveStore();
  let fail = false;
  const client: BridgeClient = {
    available: true,
    invoke: (method) => {
      if (method !== 'command/preview') return Promise.resolve({ ok: true, data: null } as never);
      return fail
        ? Promise.resolve({ ok: false, reason: 'hub_unavailable' } as never)
        : Promise.resolve({
            ok: true,
            data: [{ name: 'skill:rxopen-hot', description: '查热搜', source: 'skill' }],
          } as never);
    },
    subscribe: () => () => undefined,
  };
  const controller = createLiveController(client, store);
  expect(await controller.fetchCommandPreview()).toEqual([{ name: 'skill:rxopen-hot', description: '查热搜', source: 'skill' }]);
  fail = true;
  expect(await controller.fetchCommandPreview()).toEqual([]);
});


test('T29 运行状态方法族：快照/诊断日志/回收/常驻/档位/导出经对应 api 透传', async () => {
  const client = makeClient();
  const store = createLiveStore();
  const controller = createLiveController(client, store);

  const snapshot = await controller.runtime.fetchRuntimeSnapshot();
  expect(snapshot).toBeNull(); // makeClient 对 app/runtime 返回 data:null → 快照失败面
  expect(client.invokes).toContain('app/runtime');

  await controller.runtime.fetchDiagnosticLog();
  expect(client.invokes).toContain('app/diagnosticLog');

  expect(await controller.runtime.retireSession('t1')).toBeNull();
  expect(client.invokes).toContain('session/retire');

  expect(await controller.runtime.forceRetireSession('t1')).toBeNull();
  expect(client.invokes).toContain('session/forceRetire');

  expect(await controller.runtime.setKeepalive('t1', true)).toBeNull();
  expect(client.invokes).toContain('session/setKeepalive');

  expect(await controller.runtime.setIdleRecycle(10)).toBeNull(); // data:null → minutes 取不到 → null（失败面）
  expect(client.invokes).toContain('app/setIdleRecycle');

  await controller.runtime.exportDiagnostics();
  expect(client.invokes).toContain('app/exportDiagnostics');
});

test('症状回归「轮结算后历史全没了（对话收起来）」：窗口重建保前缀、权威替换本轮 span', async () => {
  const timers = stubTimers();
  const store = createLiveStore();
  const threadId = 't1';
  const hist = [
    { kind: 'user', id: 'u1', text: '旧问', origin: 'user', images: [], at: 1 },
    { kind: 'assistant', id: 'a1', text: '旧答', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 2 },
  ] as never;
  const window_ = [
    { kind: 'user', id: 'u2', text: '新问', origin: 'user', images: [], at: 3 },
    { kind: 'assistant', id: 'a2', text: '新答', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 4 },
  ] as never;
  let listener: ((events: readonly unknown[]) => void) | undefined;
  const client: BridgeClient = {
    available: true,
    invoke: (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({ ok: true, data: { sessions: [], saved: [], models: [], providers: [] } } as never);
      }
      if (method === 'session/entries') {
        // 轮末窗口拉取：since=轮首游标（u1/a1 之后的本轮转写）
        return Promise.resolve({ ok: true, data: { items: window_, cursor: 'a2' } } as never);
      }
      if (method === 'session/stats') {
        return Promise.resolve({ ok: true, data: { contextUsage: null, tokensTotal: 0 } } as never);
      }
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
  const controller = createLiveController(client, store);
  await controller.start();
  const emit = (event: unknown): void => listener?.([event]);
  store.setState({
    sessions: {
      [threadId]: { threadId, cwd: '/w', sessionPath: '/w/s/t1.jsonl', title: 't', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 },
    },
    threads: { [threadId]: undefined },
    activeThreadId: threadId,
  });
  // 既有历史（冷启动水化形态）
  store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: hist, cursor: 'a1' });
  // 本轮：开轮（轮首游标=a1）→ 用户回显（entry id=u2）→ 结算
  emit({ type: 'turnStarted', threadId, at: 5 });
  emit({ type: 'userMessage', threadId, message: { id: 'u2', text: '新问', origin: 'user' } });
  emit({ type: 'turnSettled', threadId, usage: null });
  timers.fire();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

  const texts = (store.getState().threads[threadId]?.items ?? []).map((item) =>
    item.kind === 'message'
      ? item.message.text
      : item.turn.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join(''),
  );
  // 历史保住（u1 问 + a1 轮），本轮以权威窗口呈现（新答），live 句柄清空
  expect(texts.some((text) => text.includes('旧问'))).toBe(true);
  expect(texts.some((text) => text.includes('旧答'))).toBe(true);
  expect(texts.some((text) => text.includes('新答'))).toBe(true);
  expect(store.getState().threads[threadId]?.liveTurnId ?? null).toBeNull();
  controller.dispose();
});

test('症状回归「流式中 ! 直执行：正在生成的回复瞬间消失」：bash 重建对在途轮降级为不拆轮 reconcile', async () => {
  const store = createLiveStore();
  const threadId = 't1';
  let listener: ((events: readonly unknown[]) => void) | undefined;
  const client: BridgeClient = {
    available: true,
    invoke: (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({ ok: true, data: { sessions: [], saved: [], models: [], providers: [] } } as never);
      }
      // bash 应答时转写窗口为空（hub 把 bash 条目延迟登记到轮 settle 前）
      if (method === 'session/entries') return Promise.resolve({ ok: true, data: { items: [], cursor: null } } as never);
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
  const controller = createLiveController(client, store);
  await controller.start();
  const emit = (event: unknown): void => listener?.([event]);
  store.setState({
    sessions: {
      [threadId]: { threadId, cwd: '/w', sessionPath: '/w/s/t1.jsonl', title: 't', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 },
    },
    activeThreadId: threadId,
    threads: { [threadId]: undefined },
  });
  // 在途轮：已流出一段未落盘增量
  emit({ type: 'turnStarted', threadId, at: 1 });
  emit({ type: 'messageStarted', threadId, messageId: 'm1', at: 2 });
  emit({ type: 'textDelta', threadId, messageId: 'm1', delta: '在途前半' });

  const reason = await controller.runBash(threadId, '! git status');
  expect(reason).toBeNull();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  const after = store.getState().threads[threadId];
  expect(after?.streaming).toBe(true);
  expect(after?.liveTurnId ?? null).not.toBeNull();
  const liveTurn = after?.items.find((item) => item.kind === 'turn' && item.turn.id === after?.liveTurnId);
  expect(liveTurn).toBeDefined();
  controller.dispose();
});

test('症状回归「followUp 续轮开头一段流式内容消失」：settle 重建 await 在途翻代由 staleGuard 弃用迟到载荷', async () => {
  const timers = stubTimers();
  const store = createLiveStore();
  const threadId = 't1';
  let listener: ((events: readonly unknown[]) => void) | undefined;
  let releaseEntries: ((outcome: { ok: true; data: { items: unknown[]; cursor: string | null } }) => void) | undefined;
  const gate = new Promise<{ ok: true; data: { items: unknown[]; cursor: string | null } }>((resolve) => {
    releaseEntries = resolve;
  });
  const client: BridgeClient = {
    available: true,
    invoke: (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({ ok: true, data: { sessions: [], saved: [], models: [], providers: [] } } as never);
      }
      if (method === 'session/entries') return gate as never;
      if (method === 'session/stats') return Promise.resolve({ ok: true, data: { contextUsage: null, tokensTotal: 0 } } as never);
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
  const controller = createLiveController(client, store);
  await controller.start();
  const emit = (event: unknown): void => listener?.([event]);
  store.setState({
    sessions: {
      [threadId]: { threadId, cwd: '/w', sessionPath: '/w/s/t1.jsonl', title: 't', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 },
    },
    activeThreadId: threadId,
    threads: { [threadId]: undefined },
  });
  emit({ type: 'turnStarted', threadId, at: 1 });
  emit({ type: 'messageStarted', threadId, messageId: 'm1', at: 2 });
  emit({ type: 'turnSettled', threadId, usage: null });
  timers.fire(); // settle 的 120ms 定时器触发 → entries invoke 挂起（gate）
  // invoke 在途时 followUp 自动续轮开始并流出一段内容
  emit({ type: 'turnStarted', threadId, at: 5 });
  emit({ type: 'messageStarted', threadId, messageId: 'm2', at: 6 });
  emit({ type: 'textDelta', threadId, messageId: 'm2', delta: '续轮在途' });
  // 旧轮的窗口应答迟到：staleGuard 必须弃用（不得拆掉新轮）
  releaseEntries?.({ ok: true, data: { items: [{ kind: 'user', id: 'u1', text: '问', origin: 'user', images: [], at: 1 }], cursor: 'u1' } });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  const after = store.getState().threads[threadId];
  expect(after?.liveTurnId ?? null).not.toBeNull();
  const liveTurn = after?.items.find((item) => item.kind === 'turn' && item.turn.id === after?.liveTurnId);
  expect(liveTurn).toBeDefined();
  controller.dispose();
});

test('症状回归「重载后切回流式中的会话，正在生成的内容消失一段」：live 冷启动拉补走 reconcile 保在途增量', async () => {
  const store = createLiveStore();
  const threadId = 't1';
  let listener: ((events: readonly unknown[]) => void) | undefined;
  const persisted = [{ kind: 'user', id: 'u1', text: '旧问', origin: 'user', images: [], at: 1 }];
  const client: BridgeClient = {
    available: true,
    invoke: (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({ ok: true, data: { sessions: [], saved: [], models: [], providers: [] } } as never);
      }
      // 全量拉补只含已落盘前缀（在途消息未 message_end 不在转写）
      if (method === 'session/entries') return Promise.resolve({ ok: true, data: { items: persisted, cursor: 'u1' } } as never);
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
  const controller = createLiveController(client, store);
  await controller.start();
  const emit = (event: unknown): void => listener?.([event]);
  // 重载后：事件流先到，折出在途轮与已流出增量
  store.setState({
    sessions: {
      [threadId]: { threadId, cwd: '/w', sessionPath: '/w/s/t1.jsonl', title: 't', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 },
    },
    activeThreadId: threadId,
    threads: { [threadId]: undefined },
  });
  emit({ type: 'turnStarted', threadId, at: 1 });
  emit({ type: 'messageStarted', threadId, messageId: 'm1', at: 2 });
  emit({ type: 'textDelta', threadId, messageId: 'm1', delta: '在途前半' });

  await controller.ensureHydrated(threadId);
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  const after = store.getState().threads[threadId];
  // 在途轮保留（liveTurnId/streaming 不被整表重置抹掉），历史前缀补齐，hydrated 置位
  expect(after?.streaming).toBe(true);
  expect(after?.liveTurnId ?? null).not.toBeNull();
  expect(after?.hydrated).toBe(true);
  expect(after?.items.some((item) => item.kind === 'message' && item.message.text.includes('旧问'))).toBe(true);
  const liveTurn = after?.items.find((item) => item.kind === 'turn' && item.turn.id === after?.liveTurnId);
  expect(liveTurn).toBeDefined();
  controller.dispose();
});

test('症状回归「重载落在轮次进行中：同一轮折叠分裂成两个（共工作/已工作）」：拉补先落、事件后到时补挂重定基收回双渲染', async () => {
  const store = createLiveStore();
  const threadId = 't1';
  let listener: ((events: readonly unknown[]) => void) | undefined;
  const persisted = [
    { kind: 'user', id: 'u1', text: '看一下今天天气，还有未来5天的', origin: 'user', images: [], at: 1 },
    { kind: 'assistant', id: 'a1', text: '在途前半（已落盘）', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 2 },
  ];
  const client: BridgeClient = {
    available: true,
    invoke: (method: string, params?: unknown) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({ ok: true, data: { sessions: [], saved: [], models: [], providers: [] } } as never);
      }
      // t2 的重定基拉取走拒绝路径（桥瞬断形态）：补挂的 .catch 不得外抛
      if (method === 'session/entries' && (params as { threadId?: string } | undefined)?.threadId === 't2') {
        return Promise.reject(new Error('bridge_down')) as never;
      }
      if (method === 'session/entries') return Promise.resolve({ ok: true, data: { items: persisted, cursor: 'a1' } } as never);
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
  const controller = createLiveController(client, store);
  await controller.start();
  const emit = (event: unknown): void => listener?.([event]);
  store.setState({
    sessions: {
      [threadId]: { threadId, cwd: '/w', sessionPath: '/w/s/t1.jsonl', title: 't', state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 },
    },
    activeThreadId: threadId,
    threads: { [threadId]: undefined },
  });

  // 重载回落序：冷启动拉补先落（在途轮的持久前缀成为独立折叠轮）
  await controller.ensureHydrated(threadId);
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  expect(store.getState().threads[threadId]?.items.filter((item) => item.kind === 'turn')).toHaveLength(1);

  // 事件流随后到达（错过 turnStarted）：live 轮折出 → 补挂重定基收回双渲染
  emit({ type: 'messageStarted', threadId, messageId: 'm1', at: 3 });
  emit({ type: 'textDelta', threadId, messageId: 'm1', delta: '在途后半' });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

  const after = store.getState().threads[threadId];
  const turns = after?.items.filter((item) => item.kind === 'turn') ?? [];
  expect(turns).toHaveLength(1); // 同一轮单一渲染体：live 轮独占
  expect(turns[0]?.kind === 'turn' && turns[0].turn.id === after?.liveTurnId).toBe(true);
  expect(after?.streaming).toBe(true);

  // 拒绝路径：另一线程的补挂重定基遇桥瞬断不外抛、不动现场
  store.setState({
    threads: {
      ...store.getState().threads,
      t2: { ...(store.getState().threads[threadId] as object), liveTurnId: null, items: turns.slice() } as never,
    },
  });
  emit({ type: 'messageStarted', threadId: 't2', messageId: 'm9', at: 9 });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  // 拒绝不外抛（.catch 兜住）；live 轮照常折出，分裂留待 settle 权威重建收口
  expect(store.getState().threads.t2?.liveTurnId ?? null).not.toBeNull();
  controller.dispose();
});
