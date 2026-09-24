import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/** controller provider/偏好/思考档面（覆盖门缺口件）：
 *  upsertProvider/removeProvider 双写（providers + models 刷新）、updatePreferences
 *  null 降级、testProvider reason 化、steerSubagent 空消息守卫。 */

function makeClient(overrides: {
  providerUpsert?: unknown;
  providerRemove?: unknown;
  modelsList?: unknown;
  setPreference?: unknown;
  providerTest?: unknown;
  steer?: unknown;
} = {}): BridgeClient {
  let listener: ((event: unknown) => void) | undefined;
  return {
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string) => {
      if (method === 'app/bootstrap') {
        return Promise.resolve({
          ok: true,
          data: { sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] }, hostPhase: 'ready' },
        } as never);
      }
      if (method === 'provider/upsert') return (overrides.providerUpsert ?? { ok: true, data: [] }) as never;
      if (method === 'provider/remove') return (overrides.providerRemove ?? { ok: true, data: [] }) as never;
      if (method === 'model/list') return (overrides.modelsList ?? { ok: true, data: [] }) as never;
      if (method === 'app/setPreference') return (overrides.setPreference ?? { ok: true, data: {} }) as never;
      if (method === 'provider/test') return (overrides.providerTest ?? { ok: true, data: { latencyMs: 42 } }) as never;
      if (method === 'subagent/steer') return (overrides.steer ?? { ok: true, data: null }) as never;
      return Promise.resolve({ ok: true, data: null } as never);
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  } as never;
}

const PREFERENCES = { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] };

test('upsertProvider：成功双写（providers + models 都刷新进 store）', async () => {
  const store = createLiveStore();
  const controller = createLiveController(makeClient({
    providerUpsert: { ok: true, data: [{ name: 'p1' }] },
    modelsList: { ok: true, data: [{ provider: 'p1', id: 'm1' }] },
  }), store);
  await controller.start();
  const reason = await controller.upsertProvider({ name: 'p1', baseUrl: 'https://x', api: 'openai', models: [] });
  expect(reason).toBeNull();
  expect(store.getState().providers).toEqual([{ name: 'p1' }]);
  expect(store.getState().models).toEqual([{ provider: 'p1', id: 'm1' }]); // model/list 走 channelModels 收窄
  controller.dispose();
});

test('upsertProvider：hub 拒 → reason 文案、store 不动', async () => {
  const store = createLiveStore();
  const controller = createLiveController(makeClient({
    providerUpsert: { ok: false, error: { kind: 'invalid_input', message: 'bad url' } },
  }), store);
  await controller.start();
  const reason = await controller.upsertProvider({ name: 'p1', baseUrl: 'x', api: 'openai', models: [] });
  expect(typeof reason).toBe('string');
  expect(store.getState().providers).toEqual([]);
  controller.dispose();
});

test('removeProvider：成功双写；updatePreferences 失败 → null', async () => {
  const store = createLiveStore();
  const controller = createLiveController(makeClient({
    providerRemove: { ok: true, data: [] },
    modelsList: { ok: true, data: [] },
    setPreference: { ok: false, error: { kind: 'io_failed', message: 'x' } },
  }), store);
  await controller.start();
  expect(await controller.removeProvider('p1')).toBeNull();
  expect(store.getState().providers).toEqual([]);
  expect(await controller.updatePreferences({ defaultModel: null })).toBeNull();
  controller.dispose();
});

test('updatePreferences：成功落 store', async () => {
  const store = createLiveStore();
  const next = { ...PREFERENCES, defaultModel: 'p1/m1' };
  const controller = createLiveController(makeClient({ setPreference: { ok: true, data: next } }), store);
  await controller.start();
  expect(await controller.updatePreferences({ defaultModel: 'p1/m1' })).toEqual(next);
  expect(store.getState().preferences.defaultModel).toBe('p1/m1');
  controller.dispose();
});

test('testProvider：成功延迟值 / 失败 reason 化', async () => {
  const store = createLiveStore();
  const ok = createLiveController(makeClient(), store);
  await ok.start();
  expect(await ok.testProvider('p1', undefined)).toEqual({ ok: true, latencyMs: 42 });
  ok.dispose();

  const fail = createLiveController(makeClient({
    providerTest: { ok: false, error: { kind: 'transient', face: 'host_unavailable' } },
  }), createLiveStore());
  await fail.start();
  const outcome = await fail.testProvider('p1', 'm1');
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(typeof outcome.reason).toBe('string');
  fail.dispose();
});

test('steerSubagent：空消息守卫（empty_message）；成功 null；失败透 kind', async () => {
  const store = createLiveStore();
  const controller = createLiveController(makeClient({
    steer: { ok: false, error: { kind: 'unknown_thread', message: 'x' } },
  }), store);
  await controller.start();
  expect(await controller.steerSubagent('t1', 'a1', '   ')).toBe('empty_message');
  expect(await controller.steerSubagent('t1', 'a1', 'hi')).toBe('unknown_thread');
  controller.dispose();
});
