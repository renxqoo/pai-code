import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore, type LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/** 受信（trusted）与权限规则控制器回归：参数透传、reload 编排、stop 失败中止。 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

function makeClient(
  results: Record<string, Outcome>,
): BridgeClient & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  let listener: ((event: unknown) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
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

const rules = {
  mode: 'ask' as const,
  bash: { allowPatterns: [], blockPatterns: ['sudo *'] },
  write: { allowPatterns: [], blockPatterns: [] },
  edit: { allowPatterns: [], blockPatterns: [] },
};

test('permission 读取成功入 store；失败返回 null 且不动旧值', async () => {
  const okClient = makeClient({ 'permission/read': { ok: true, data: rules } });
  const okStore = createLiveStore();
  expect(await createLiveController(okClient, okStore).refreshPermissionRules()).toEqual(rules);
  expect(okStore.getState().permissionRules).toEqual(rules);

  const failStore = createLiveStore();
  const controller = createLiveController(makeClient({ 'permission/read': { ok: false, reason: 'io' } }), failStore);
  expect(await controller.refreshPermissionRules()).toBeNull();
  expect(failStore.getState().permissionRules).toBeNull();
});

test('permission 写入成功更新 store 并返回 null；失败透传原因', async () => {
  const okClient = makeClient({ 'permission/write': { ok: true, data: rules } });
  const okStore = createLiveStore();
  expect(await createLiveController(okClient, okStore).writePermissionRules(rules)).toBeNull();
  expect(okStore.getState().permissionRules).toEqual(rules);

  const failController = createLiveController(makeClient({ 'permission/write': { ok: false, reason: 'write_failed' } }), createLiveStore());
  expect(await failController.writePermissionRules(rules)).toBe('write_failed');
});

test('createSession / openSavedSession 透传 trusted', async () => {
  const client = makeClient({
    'session/start': { ok: true, data: { threadId: 't1', cwd: '/w', sessionPath: null, state: 'live', streaming: false, title: 'x', model: null, thinkingLevel: null, lastActivityAt: 0 } },
    'session/resume': { ok: true, data: { threadId: 't2', cwd: '/w', sessionPath: '/s.jsonl', state: 'live', streaming: false, title: 'x', model: null, thinkingLevel: null, lastActivityAt: 0 } },
    'session/listSaved': { ok: true, data: [] },
  });
  const controller = createLiveController(client, createLiveStore());
  await controller.createSession('/w', undefined, true);
  await controller.openSavedSession('/s.jsonl', false);
  const start = client.calls.find((call) => call.method === 'session/start');
  const resume = client.calls.find((call) => call.method === 'session/resume');
  expect(start?.params).toMatchObject({ cwd: '/w', trusted: true });
  expect(resume?.params).toMatchObject({ sessionPath: '/s.jsonl', trusted: false });
});

test('reloadSessionTrusted：stop → resume(trusted) → 激活新会话', async () => {
  const client = makeClient({
    'session/resume': { ok: true, data: { threadId: 't9', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: 'x', model: null, thinkingLevel: null, lastActivityAt: 0 } },
    'session/listSaved': { ok: true, data: [] },
  });
  const store: LiveStore = createLiveStore();
  store.getState().bootstrap({
    sessions: [{ threadId: 't1', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '旧', model: null, thinkingLevel: null, lastActivityAt: 0 }],
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] },
  });
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(true);
  const order = client.calls.map((call) => call.method);
  expect(order).toContain('session/stop');
  expect(order.indexOf('session/stop')).toBeLessThan(order.indexOf('session/resume'));
  expect(client.calls.find((call) => call.method === 'session/resume')?.params).toMatchObject({ sessionPath: '/a.jsonl', trusted: true });
  expect(store.getState().activeThreadId).toBe('t9');
});

test('reloadSessionTrusted：stop 失败即中止（不发 resume）；无会话路径直接拒绝', async () => {
  const client = makeClient({ 'session/stop': { ok: false, reason: 'busy' } });
  const store = createLiveStore();
  store.getState().bootstrap({
    sessions: [{ threadId: 't1', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '旧', model: null, thinkingLevel: null, lastActivityAt: 0 }],
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] },
  });
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(false);
  expect(client.calls.some((call) => call.method === 'session/resume')).toBe(false);

  const noPathStore = createLiveStore();
  noPathStore.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
  const noPathClient = makeClient({});
  expect(await createLiveController(noPathClient, noPathStore).reloadSessionTrusted('ghost', true)).toBe(false);
  expect(noPathClient.calls).toEqual([]);
});

test('reloadSessionTrusted：stop 成功但 resume 失败——返回 false 且刷新 saved（History 可找回）', async () => {
  const client = makeClient({ 'session/resume': { ok: false, reason: 'hub_busy' } });
  const store = createLiveStore();
  store.getState().bootstrap({
    sessions: [{ threadId: 't1', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '旧', model: null, thinkingLevel: null, lastActivityAt: 0 }],
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] },
  });
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(false);
  expect(client.calls.some((call) => call.method === 'session/listSaved')).toBe(true);
});

test('reloadSessionTrusted：重开前非活跃会话——成功后不劫持 activeThread', async () => {
  const client = makeClient({
    'session/resume': { ok: true, data: { threadId: 't9', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: 'x', model: null, thinkingLevel: null, lastActivityAt: 0 } },
    'session/listSaved': { ok: true, data: [] },
  });
  const store = createLiveStore();
  store.getState().bootstrap({
    sessions: [
      { threadId: 't1', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '旧', model: null, thinkingLevel: null, lastActivityAt: 0 },
      { threadId: 't2', cwd: '/w2', sessionPath: '/b.jsonl', state: 'live', streaming: false, title: '别', model: null, thinkingLevel: null, lastActivityAt: 0 },
    ],
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] },
  });
  store.getState().setActiveThread('t2');
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(true);
  expect(store.getState().activeThreadId).toBe('t2');
});

test('refreshAgents 判活：请求发出后会话已切换则丢弃响应', async () => {
  const client = makeClient({
    'agent/list': { ok: true, data: [{ name: 'reviewer', description: '', source: 'user', tools: null, model: null }] },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  const pending = controller.refreshAgents('t1');
  // 响应到达前切走
  store.getState().setActiveThread('t2');
  await pending;
  expect(store.getState().agents).toEqual([]);
});
