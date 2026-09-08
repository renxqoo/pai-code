import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/** hub 凭据操作（auth/list / setKey / removeKey）的透传、刷新与失败原因回归。 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

function makeClient(results: Record<string, Outcome>): BridgeClient & { calls: string[] } {
  const calls: string[] = [];
  let listener: ((event: unknown) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string, params?: unknown) => {
      calls.push(method);
      void params;
      const outcome = results[method] ?? { ok: true as const, data: null };
      return Promise.resolve(outcome as never);
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  };
}

test('refreshCredentials 成功写入 store；失败保持原值', async () => {
  const okClient = makeClient({ 'auth/list': { ok: true, data: [{ provider: 'anthropic', type: 'api_key' }] } });
  const okStore = createLiveStore();
  await createLiveController(okClient, okStore).refreshCredentials();
  expect(okStore.getState().credentials).toEqual([{ provider: 'anthropic', type: 'api_key' }]);

  const failStore = createLiveStore();
  const failClient = makeClient({
    'auth/list': { ok: true, data: [{ provider: 'anthropic', type: 'api_key' }] },
  });
  await createLiveController(failClient, failStore).refreshCredentials();
  const failController = createLiveController(
    makeClient({ 'auth/list': { ok: false, reason: 'hub_busy' } }),
    failStore,
  );
  await failController.refreshCredentials();
  expect(failStore.getState().credentials).toEqual([{ provider: 'anthropic', type: 'api_key' }]);
});

test('setProviderKey 成功返回 null 且随后刷新凭据目录', async () => {
  const client = makeClient({ 'auth/list': { ok: true, data: [{ provider: 'anthropic', type: 'api_key' }] } });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  expect(await controller.setProviderKey('anthropic', 'sk-x')).toBeNull();
  const order = client.calls.slice(-2);
  expect(order).toEqual(['auth/setKey', 'auth/list']);
  expect(store.getState().credentials).toEqual([{ provider: 'anthropic', type: 'api_key' }]);
});

test('setProviderKey 失败透传原因且不刷新目录', async () => {
  const client = makeClient({
    'auth/setKey': { ok: false, reason: 'unknown_provider' },
    'auth/list': { ok: true, data: [{ provider: 'anthropic', type: 'api_key' }] },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  expect(await controller.setProviderKey('nope', 'sk-x')).toBe('unknown_provider');
  expect(client.calls).not.toContain('auth/list');
  expect(store.getState().credentials).toEqual([]);
});

test('removeProviderKey 成功返回 null 并刷新；失败透传原因（OAuth 保护等）', async () => {
  const okClient = makeClient({ 'auth/list': { ok: true, data: [] } });
  const okStore = createLiveStore();
  await createLiveController(okClient, okStore).removeProviderKey('anthropic');
  expect(okStore.getState().credentials).toEqual([]);
  expect(okClient.calls).toEqual(['auth/removeKey', 'auth/list']);

  const failClient = makeClient({ 'auth/removeKey': { ok: false, reason: 'oauth_protected' } });
  const controller = createLiveController(failClient, createLiveStore());
  expect(await controller.removeProviderKey('x')).toBe('oauth_protected');
});
