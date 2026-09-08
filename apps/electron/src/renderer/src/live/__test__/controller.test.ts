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
  let listener: ((event: unknown) => void) | undefined;
  return {
    invokes,
    available: true,
    emitToController: (event: unknown) => listener?.(event),
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
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
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
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true } });

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
