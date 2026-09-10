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
  let listener: ((events: readonly unknown[]) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.([event]),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      const outcome = results[method] ?? { ok: true as const, data: null };
      return Promise.resolve(outcome as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
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
  await controller.createSession({ cwd: '/w', trusted: true });
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

test('agent 定义管理面：upsert/remove 透传 reason 并刷新快照', async () => {
  const definition = { name: 'search', description: 'd', systemPrompt: 'p', tools: null, model: null, scope: 'user', project: null };
  const client = makeClient({
    'agent/definitions': { ok: true, data: [definition] },
    'agent/upsert': { ok: false, reason: 'name_exists' },
    'agent/remove': { ok: true, data: null },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  const key = { file: 'search', scope: 'user' as const, project: null };
  // upsert 失败：reason 透传（表单内联），不刷新快照
  expect(await controller.upsertAgentDefinition(definition, null)).toBe('name_exists');
  expect(store.getState().agentDefinitions).toEqual([]);
  // remove 成功：reason null + 快照刷新
  expect(await controller.removeAgentDefinition(key)).toBeNull();
  expect(store.getState().agentDefinitions).toEqual([definition]);
});

test('会话级规则读取/写入/清除透传（sidecar）', async () => {
  const effective = { mode: 'ask' as const, bash: { allowPatterns: [], blockPatterns: ['sudo *'] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } };
  const client = makeClient({
    'permission/sessionRead': { ok: true, data: { rules: effective, source: 'thread' } },
    'permission/sessionWrite': { ok: true, data: null },
  });
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  const read = await controller.readSessionRules('t1');
  expect(read).toEqual({ rules: effective, source: 'thread' });
  expect(store.getState().sessionRules).toEqual({ rules: effective, source: 'thread' });

  expect(await controller.writeSessionRules('t1', effective)).toBeNull();
  expect(client.calls).toContainEqual({ method: 'permission/sessionWrite', params: { threadId: 't1', rules: effective } });
  expect(await controller.writeSessionRules('t1', null)).toBeNull();
  expect(client.calls).toContainEqual({ method: 'permission/sessionWrite', params: { threadId: 't1', rules: null } });
});

test('症状回归：readSessionRules 引用幂等——内容相同不换引用（防草稿重置循环击穿模式切换）', async () => {
  const effective = { mode: 'ask' as const, bash: { allowPatterns: [], blockPatterns: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } };
  let reads = 0;
  const client = makeClient({
    'permission/sessionRead': { ok: true, data: { rules: effective, source: 'thread' } },
  });
  // makeClient 的 data 为固定引用；包一层计数透传
  const baseInvoke = client.invoke.bind(client);
  client.invoke = async (method: string, params: unknown) => {
    if (method === 'permission/sessionRead') reads += 1;
    return baseInvoke(method, params);
  };
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  const first = await controller.readSessionRules('t1');
  const firstRef = store.getState().sessionRules;
  const second = await controller.readSessionRules('t1');
  expect(reads).toBe(2);
  expect(second).toBe(first);
  expect(store.getState().sessionRules).toBe(firstRef);
});

test('症状回归：readSessionRules 判活——响应落地前会话已切换则丢弃（防旧会话规则覆盖新会话视图）', async () => {
  const staleRules = { mode: 'allow-all' as const, bash: { allowPatterns: [], blockPatterns: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } };
  const client = makeClient({
    'permission/sessionRead': { ok: true, data: { rules: staleRules, source: 'thread' } },
  });
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  const pending = controller.readSessionRules('t1');
  // 响应落地前切走
  store.getState().setActiveThread('t2');
  await pending;
  expect(store.getState().sessionRules).toBeNull();
});

test('症状回归：全局规则写入/刷新后同步刷新活跃会话生效视图（防操作栏以陈旧全局为基线切模式丢 patterns）', async () => {
  const globalRules = { mode: 'allow-all' as const, bash: { allowPatterns: ['git *'], blockPatterns: [] }, write: { allowPatterns: [], blockPatterns: [] }, edit: { allowPatterns: [], blockPatterns: [] } };
  const client = makeClient({
    'permission/read': { ok: true, data: globalRules },
    'permission/write': { ok: true, data: globalRules },
    'permission/sessionRead': { ok: true, data: { rules: globalRules, source: 'global' } },
  });
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  expect(await controller.writePermissionRules(globalRules)).toBeNull();
  expect(store.getState().sessionRules).toEqual({ rules: globalRules, source: 'global' });
  store.setState({ sessionRules: null });
  expect(await controller.refreshPermissionRules()).toEqual(globalRules);
  expect(store.getState().sessionRules).toEqual({ rules: globalRules, source: 'global' });
});

test('steerSubagent：trim 校验 + 命令透传 + 失败原因', async () => {
  const client = makeClient({ 'subagent/steer': { ok: false, reason: 'not_running' } });
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.steerSubagent('t1', 's1', '   ')).toBe('empty_message');
  expect(await controller.steerSubagent('t1', 's1', ' 提速 ')).toBe('not_running');
  expect(client.calls).toContainEqual({ method: 'subagent/steer', params: { threadId: 't1', subagentId: 's1', message: '提速' } });

  const okClient = makeClient({});
  expect(await createLiveController(okClient, createLiveStore()).steerSubagent('t1', 's1', 'go')).toBeNull();
});

const startData = {
  threadId: 't1',
  cwd: '/w',
  sessionPath: null,
  state: 'live',
  streaming: false,
  title: 'x',
  model: null,
  thinkingLevel: null,
  lastActivityAt: 0,
};

test('createSession 选项化：start 成功后后置应用 thinkingLevel 与 permissionMode（sidecar 以全局规则为基线）', async () => {
  const client = makeClient({
    'session/start': { ok: true, data: startData },
    'permission/read': { ok: true, data: rules },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);  await controller.refreshPermissionRules();
  const outcome = await controller.createSession({
    cwd: '/w',
    trusted: false,
    model: { provider: 'a', modelId: 'm' },
    thinkingLevel: 'high',
    permissionMode: 'block-all',
  });
  expect(outcome).toEqual({ ok: true, threadId: 't1' });
  expect(client.calls.find((call) => call.method === 'session/start')?.params).toMatchObject({
    cwd: '/w',
    provider: 'a',
    modelId: 'm',
    trusted: false,
  });
  const order = client.calls.map((call) => call.method);
  expect(order.indexOf('session/start')).toBeLessThan(order.indexOf('session/setThinking'));
  expect(client.calls.find((call) => call.method === 'session/setThinking')?.params).toEqual({ threadId: 't1', level: 'high' });
  // 以全局规则为基线只改 mode（不丢 patterns、不丢其余字段）
  expect(client.calls.find((call) => call.method === 'permission/sessionWrite')?.params).toEqual({
    threadId: 't1',
    rules: { ...rules, mode: 'block-all' },
  });
});

test('createSession：不传后置项时不多发命令；全局规则未加载时先现拉再定；start 失败透传原因', async () => {
  const bare = makeClient({ 'session/start': { ok: true, data: startData } });
  expect(await createLiveController(bare, createLiveStore()).createSession({ cwd: '/w' })).toEqual({ ok: true, threadId: 't1' });
  expect(bare.calls.some((call) => call.method === 'session/setThinking')).toBe(false);
  expect(bare.calls.some((call) => call.method === 'permission/sessionWrite')).toBe(false);

  // 症状回归：全局规则未入 store 时建会话现拉（新任务页的权限选择不再静默丢失）
  const lateRules = makeClient({ 'session/start': { ok: true, data: startData }, 'permission/read': { ok: true, data: rules } });
  expect(await createLiveController(lateRules, createLiveStore()).createSession({ cwd: '/w', permissionMode: 'allow-all' })).toEqual({ ok: true, threadId: 't1' });
  expect(lateRules.calls.find((call) => call.method === 'permission/sessionWrite')?.params).toEqual({
    threadId: 't1',
    rules: { ...rules, mode: 'allow-all' },
  });

  // 现拉也拿不到（无基线可比，宁缺勿错）
  const noRules = makeClient({ 'session/start': { ok: true, data: startData }, 'permission/read': { ok: false, reason: 'io' } });
  expect(await createLiveController(noRules, createLiveStore()).createSession({ cwd: '/w', permissionMode: 'allow-all' })).toEqual({
    ok: true,
    threadId: 't1',
  });
  expect(noRules.calls.some((call) => call.method === 'permission/sessionWrite')).toBe(false);

  const failed = makeClient({ 'session/start': { ok: false, reason: 'cwd_missing' } });
  expect(await createLiveController(failed, createLiveStore()).createSession({ cwd: '/nope' })).toEqual({
    ok: false,
    reason: 'cwd_missing',
  });
});

test('症状回归：bootstrap 后即拉全局权限规则（新任务页权限控件数据源，不再等进设置页才可见）', async () => {
  const client = makeClient({
    'app/bootstrap': {
      ok: true,
      data: { sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } },
    },
    'permission/read': { ok: true, data: rules },
  });
  const store = createLiveStore();
  await createLiveController(client, store).start();
  // 启动内全局规则拉取是 fire-and-forget，让在途 promise 落地
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(client.calls.some((call) => call.method === 'permission/read')).toBe(true);
  expect(store.getState().permissionRules).toEqual(rules);
});
