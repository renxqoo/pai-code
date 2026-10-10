import { describe, expect, test } from 'bun:test';

import { createSettingsRoutes } from '../settings';

/**
 * 模型配置保存 × 会话存活（症状回归：保存模型 → host SIGKILL → 全部 agent 中断）：
 * hub 侧 models/reload 热更新链路就位后，无 key 变更的 provider 写不再重启 host；
 * key 变更（spawn env 通道 $X3CODE_KEY_*）仍需重启注入。
 */

function makeRoutes() {
  const providers = [
    { name: 'acme', baseUrl: 'https://api.acme.example/v1', api: 'openai', models: [{ id: 'm', reasoning: false, vision: false }] },
  ];
  const calls: string[] = [];
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
    getKey: (name: string) => (name === 'acme' ? 'sk-live' : null),
    setKey: () => undefined,
    keyNames: ['acme'],
  };
  return {
    calls,
    routes: createSettingsRoutes({
      settings: settings as never,
      keyStore: keyStore as never,
      restartHost: () => {
        calls.push('restart');
        return Promise.resolve(undefined);
      },
      reloadModels: () => {
        calls.push('reload');
        return Promise.resolve(undefined);
      },
      restartGateway: () => Promise.resolve(undefined),
      settingsCommands: () => {
        throw new Error('not needed for provider routes');
      },
      permissionCommands: () => {
        throw new Error('not needed for provider routes');
      },
    }).routes,
  };
}

describe('provider 保存 × 会话存活（热更新优先于重启）', () => {
  test('upsert 不带 key：调 models/reload 热更新,不重启 host', async () => {
    const h = makeRoutes();
    const outcome = await h.routes['provider/upsert']({
      name: 'acme',
      baseUrl: 'https://api.acme.example/v1',
      api: 'openai',
      models: [{ id: 'm2', reasoning: false, vision: false }],
    });
    expect(outcome.ok).toBe(true);
    expect(h.calls).toEqual(['reload']);
  });

  test('upsert 带 key：env 通道变更,仍走重启注入', async () => {
    const h = makeRoutes();
    const outcome = await h.routes['provider/upsert']({
      name: 'acme',
      baseUrl: 'https://api.acme.example/v1',
      api: 'openai',
      models: [{ id: 'm', reasoning: false, vision: false }],
      apiKey: 'sk-new',
    });
    expect(outcome.ok).toBe(true);
    expect(h.calls).toEqual(['restart']);
  });

  test('remove：调 models/reload 热更新,不重启 host', async () => {
    const h = makeRoutes();
    const outcome = await h.routes['provider/remove']({ name: 'acme' });
    expect(outcome.ok).toBe(true);
    expect(h.calls).toEqual(['reload']);
  });
});
