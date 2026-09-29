import { describe, expect, test } from 'bun:test';

import { createSettingsRoutes } from '../settings';

/**
 * relay 全局统一（T59）：settings.json 是 relay 配置唯一真相，gateway.json 是 spawn 期
 * 派生产物且只在网关启动期读入——setPreference 改 relay 必须重启网关重载，
 * 否则改了设置仍拿旧 relay 形态去配对（症状：改完点配对仍失败）。
 */

function makeRoutes(initialRelay: { relayUrl: string; relayKeyFingerprint: string }) {
  const state = {
    relay: initialRelay,
    defaultModel: null as string | null,
    onboarded: true,
    projectModels: {},
    pinnedSessions: [] as string[],
    trustedDefault: false,
    hiddenProjects: [] as string[],
    archivedSessions: [] as string[],
    idleRecycleMinutes: 5 as const,
  };
  const counters = { gatewayRestart: 0 };
  const settings = {
    listProviders: () => [],
    upsertProvider: (input: never) => ({ ok: true as const, data: [] as never[] , input }),
    removeProvider: () => ({ ok: true as const, data: [] as never[] }),
    get: () => ({ ...state }),
    patch: (patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        (state as Record<string, unknown>)[key] = value;
      }
      return { ok: true as const, data: { ...state } };
    },
  };
  const routes = createSettingsRoutes({
    settings: settings as never,
    keyStore: { getKey: () => null } as never,
    reloadModels: () => Promise.resolve(undefined),
      restartHost: () => Promise.resolve(undefined),
    restartGateway: () => {
      counters.gatewayRestart += 1;
      return Promise.resolve(undefined);
    },
    settingsCommands: () => {
      throw new Error('not needed');
    },
    permissionCommands: () => {
      throw new Error('not needed');
    },
  }).routes;
  return { routes, state, counters };
}

describe('app/setPreference：relay 全局配置写入与网关重载', () => {
  test('写入 relay 后偏好视图带回新值（读写同一真相）', async () => {
    const { routes, state } = makeRoutes({ relayUrl: '', relayKeyFingerprint: '' });
    const outcome = await routes['app/setPreference']({ relay: { relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.relay).toEqual({ relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' });
    expect(state.relay).toEqual({ relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' });
  });

  test('症状回归：relay 变更即重启网关（gateway.json 只在启动期读入）', async () => {
    const { routes, counters } = makeRoutes({ relayUrl: '', relayKeyFingerprint: '' });
    await routes['app/setPreference']({ relay: { relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' } });
    expect(counters.gatewayRestart).toBe(1);
  });

  test('relay 未变不重启（同值保存不打断在线网关）', async () => {
    const relay = { relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' };
    const { routes, counters } = makeRoutes(relay);
    await routes['app/setPreference']({ relay: { ...relay } });
    expect(counters.gatewayRestart).toBe(0);
  });

  test('非 relay 字段写入不触发网关重启', async () => {
    const { routes, counters } = makeRoutes({ relayUrl: '', relayKeyFingerprint: '' });
    await routes['app/setPreference']({ onboarded: true });
    expect(counters.gatewayRestart).toBe(0);
  });
});
