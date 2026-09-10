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
