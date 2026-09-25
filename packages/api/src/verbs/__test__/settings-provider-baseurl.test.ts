import { describe, expect, test } from 'bun:test';

import { createSettingsRoutes } from '../settings';

/**
 * 渠道 baseUrl 变更 × 存量 key 保密性（安全审查回归）：
 * 「省略 apiKey = 保留存量 key」的 UX 只对不换端点的改动成立——换 baseUrl
 * 而不重录 key 时，存量 key 会被后续 provider/test 以 Bearer 头发往新主机
 * （被攻陷渲染层无需知道 key 明文即可外发）。upsert 必须拒绝并保持档案原样。
 */

const SECRET_KEY = 'sk-live-secret-for-regression';

function makeRoutes() {
  const providers = [
    { name: 'acme', baseUrl: 'https://api.acme.example/v1', api: 'openai', models: [{ id: 'm', reasoning: false, vision: false }] },
  ];
  const settings = {
    listProviders: () => providers.map((provider) => ({ ...provider, models: provider.models.map((model) => ({ ...model })) })),
    upsertProvider: (input: { name: string; baseUrl: string; api: string; models: Array<{ id: string }> }) => {
      const index = providers.findIndex((provider) => provider.name === input.name);
      if (index === -1) providers.push({ ...input });
      else providers[index] = { ...providers[index], ...input };
      return { ok: true as const, data: providers };
    },
    removeProvider: (name: string) => {
      providers.splice(providers.findIndex((provider) => provider.name === name), 1);
      return { ok: true as const, data: providers };
    },
    get: () => ({}) as never,
    patch: () => ({ ok: true as const, data: {} }),
  };
  const keyStore = {
    encryptionAvailable: true,
    getKey: (name: string) => (name === 'acme' ? SECRET_KEY : null),
    setKey: () => undefined,
    keyNames: ['acme'],
  };
  return {
    providers,
    routes: createSettingsRoutes({
      settings: settings as never,
      keyStore: keyStore as never,
      restartHost: () => Promise.resolve(undefined),
      settingsCommands: () => {
        throw new Error('not needed for provider routes');
      },
      permissionCommands: () => {
        throw new Error('not needed for provider routes');
      },
    }).routes,
  };
}

describe('provider/upsert：baseUrl 变更强制重录 key', () => {
  test('症状回归：改 baseUrl 且省略 apiKey → provider_baseurl_changed 拒绝，档案保持原端点', async () => {
    const { routes, providers } = makeRoutes();
    const outcome = await routes['provider/upsert']({
      name: 'acme',
      baseUrl: 'https://attacker.example/collect',
      api: 'openai',
      models: [{ id: 'm', reasoning: false, vision: false }],
    });
    expect(outcome).toEqual({ ok: false, error: { kind: 'provider_baseurl_changed' } });
    // 档案未被改写：后续 provider/test 仍探活原可信主机，存量 key 不出网到新地址
    expect(providers[0]?.baseUrl).toBe('https://api.acme.example/v1');
  });

  test('不变更 baseUrl 时省略 apiKey 仍可用（保留 key 的合法 UX）', async () => {
    const { routes } = makeRoutes();
    const outcome = await routes['provider/upsert']({
      name: 'acme',
      baseUrl: 'https://api.acme.example/v1',
      api: 'openai',
      models: [{ id: 'm2', reasoning: true, vision: false }],
    });
    expect(outcome.ok).toBe(true);
  });

  test('变更 baseUrl 且携带新 apiKey → 放行（显式重录）', async () => {
    const { routes } = makeRoutes();
    const outcome = await routes['provider/upsert']({
      name: 'acme',
      baseUrl: 'https://api.acme2.example/v1',
      api: 'openai',
      models: [{ id: 'm', reasoning: false, vision: false }],
      apiKey: 'sk-newly-entered',
    } as never);
    expect(outcome.ok).toBe(true);
  });
});
