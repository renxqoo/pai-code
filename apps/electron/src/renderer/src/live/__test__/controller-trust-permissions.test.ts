import { expect, test } from 'bun:test';

import type { ApiError } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { createLiveStore, type LiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/** 受信（trusted）与 hub 缺省/会话权限模式控制器回归：参数透传、reload 编排、stop 失败中止。 */

type Outcome = { ok: true; data: unknown } | { ok: false; error: ApiError };

function makeClient(
  results: Record<string, Outcome>,
): BridgeClient & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  const invoke = (method: string, params?: unknown): Promise<unknown> => {
    calls.push({ method, params: params ?? null });
    const outcome = results[method] ?? { ok: true as const, data: null };
    return Promise.resolve(outcome);
  };
  return {
    calls,
    available: true,
    invoke: invoke as BridgeClient['invoke'],
    subscribe: (_onEvent: (event: unknown) => void) => () => {
      // 事件面不在本装置断言范围（store 折叠各有专测）
    },
  };
}

const hubSettings = { permissionDefaultMode: 'acceptEdits' as const, thinkingDefault: 'low' as const };

test('hubSettings 读取成功入 store；失败返回 null 且不动旧值', async () => {
  const okClient = makeClient({ 'app/hubSettings': { ok: true, data: hubSettings } });
  const okStore = createLiveStore();
  expect(await createLiveController(okClient, okStore).readHubSettings()).toEqual(hubSettings);
  expect(okStore.getState().hubSettings).toEqual(hubSettings);

  const failStore = createLiveStore();
  failStore.setState({ hubSettings: hubSettings });
  expect(await createLiveController(makeClient({ 'app/hubSettings': { ok: false, error: { kind: 'io_failed' } } }), failStore).readHubSettings()).toBeNull();
  expect(failStore.getState().hubSettings).toBe(hubSettings);
});

test('hubSettings 写入：载荷只带给定字段，成功回读成套刷新并返回 null；失败透传 errorText', async () => {
  const client = makeClient({
    'app/setHubSettings': { ok: true, data: null },
    'app/hubSettings': { ok: true, data: hubSettings },
  });
  const store = createLiveStore();
  expect(await createLiveController(client, store).writeHubSettings({ permissionDefaultMode: 'acceptEdits', thinkingDefault: 'low' })).toBeNull();
  expect(client.calls).toContainEqual({ method: 'app/setHubSettings', params: { permissionDefaultMode: 'acceptEdits', thinkingDefault: 'low' } });
  expect(store.getState().hubSettings).toEqual(hubSettings);

  const failClient = makeClient({ 'app/setHubSettings': { ok: false, error: { kind: 'io_failed' } } });
  expect(await createLiveController(failClient, createLiveStore()).writeHubSettings({ permissionDefaultMode: 'plan' })).toBe('io_failed');
});

test('症状回归「hubSettings null 字段把未设置语义发给 hub」：null = 不修改该键（跳过不发）；全空补丁零命令即成功', async () => {
  const client = makeClient({
    'app/setHubSettings': { ok: true, data: null },
    'app/hubSettings': { ok: true, data: hubSettings },
  });
  const controller = createLiveController(client, createLiveStore());
  // null 键跳过：载荷不含 permissionDefaultMode
  expect(await controller.writeHubSettings({ permissionDefaultMode: null, thinkingDefault: 'high' })).toBeNull();
  expect(client.calls).toContainEqual({ method: 'app/setHubSettings', params: { thinkingDefault: 'high' } });
  // 反向：thinkingDefault null 同语义
  expect(await controller.writeHubSettings({ permissionDefaultMode: 'plan', thinkingDefault: null })).toBeNull();
  expect(client.calls).toContainEqual({ method: 'app/setHubSettings', params: { permissionDefaultMode: 'plan' } });

  const empty = makeClient({});
  expect(await createLiveController(empty, createLiveStore()).writeHubSettings({ permissionDefaultMode: null, thinkingDefault: null })).toBeNull();
  expect(empty.calls.some((call) => call.method === 'app/setHubSettings')).toBe(false);
});

test('会话权限模式读取/写入透传（permission/mode | permission/setMode）', async () => {
  const mode = { mode: 'default', source: 'session' as const };
  const client = makeClient({
    'permission/mode': { ok: true, data: mode },
    'permission/setMode': { ok: true, data: null },
  });
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  expect(await controller.readSessionPermissionMode('t1')).toEqual(mode);
  expect(store.getState().sessionPermissionMode).toEqual(mode);

  expect(await controller.setSessionPermissionMode('t1', 'fullAuto')).toBeNull();
  expect(client.calls).toContainEqual({ method: 'permission/setMode', params: { threadId: 't1', mode: 'fullAuto' } });

  const failClient = makeClient({ 'permission/setMode': { ok: false, error: { kind: 'unknown_thread' } } });
  expect(await createLiveController(failClient, createLiveStore()).setSessionPermissionMode('t1', 'plan')).toBe('unknown_thread');
});

test('症状回归：readSessionPermissionMode 引用幂等——内容相同不换引用（防刷新循环击穿模式切换）', async () => {
  const mode = { mode: 'default', source: 'user' as const };
  let reads = 0;
  const client = makeClient({ 'permission/mode': { ok: true, data: mode } });
  const baseInvoke = client.invoke.bind(client);
  client.invoke = (async (method: string, params: unknown) => {
    if (method === 'permission/mode') reads += 1;
    return baseInvoke(method as never, params);
  }) as typeof client.invoke;
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  const first = await controller.readSessionPermissionMode('t1');
  const firstRef = store.getState().sessionPermissionMode;
  const second = await controller.readSessionPermissionMode('t1');
  expect(reads).toBe(2);
  expect(second).toBe(first);
  expect(store.getState().sessionPermissionMode).toBe(firstRef);
});

test('症状回归：readSessionPermissionMode 判活——响应落地前会话已切换则丢弃（防旧会话模式覆盖新会话视图）', async () => {
  const client = makeClient({ 'permission/mode': { ok: true, data: { mode: 'fullAuto', source: 'session' } } });
  const store = createLiveStore();
  store.getState().setActiveThread('t1');
  const controller = createLiveController(client, store);
  const pending = controller.readSessionPermissionMode('t1');
  // 响应落地前切走
  store.getState().setActiveThread('t2');
  await pending;
  expect(store.getState().sessionPermissionMode).toBeNull();
});

const sessionView = (threadId: string, sessionPath: string | null) => ({
  threadId,
  cwd: '/w',
  sessionPath,
  state: 'live' as const,
  streaming: false,
  title: 'x',
  model: null,
  thinkingLevel: null,
  lastActivityAt: 0,
});

const preferences: PreferencesView = {
  defaultModel: null,
  onboarded: true,
  projectModels: {},
  pinnedSessions: [],
  trustedDefault: false,
  hiddenProjects: [],
  idleRecycleMinutes: 5,
  archivedSessions: [],
};

const bootstrapData = (threads: ReturnType<typeof sessionView>[]) => ({
  sessions: [...threads],
  saved: [],
  models: [],
  providers: [],
  preferences,
  hostPhase: 'ready' as const,
});

test('createSession / openSavedSession 透传 trusted', async () => {
  const client = makeClient({
    'session/start': { ok: true, data: sessionView('t1', null) },
    'session/resume': { ok: true, data: sessionView('t2', '/s.jsonl') },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
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
    'session/resume': { ok: true, data: sessionView('t9', '/a.jsonl') },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
    'session/listSaved': { ok: true, data: [] },
  });
  const store: LiveStore = createLiveStore();
  store.getState().bootstrap(bootstrapData([sessionView('t1', '/a.jsonl')]));
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(true);
  const order = client.calls.map((call) => call.method);
  expect(order).toContain('session/stop');
  expect(order.indexOf('session/stop')).toBeLessThan(order.indexOf('session/resume'));
  expect(client.calls.find((call) => call.method === 'session/resume')?.params).toMatchObject({ sessionPath: '/a.jsonl', trusted: true });
  expect(store.getState().activeThreadId).toBe('t9');
});

test('reloadSessionTrusted：stop 失败即中止（不发 resume）；无会话路径直接拒绝', async () => {
  const client = makeClient({ 'session/stop': { ok: false, error: { kind: 'transient', face: 'busy' } } });
  const store = createLiveStore();
  store.getState().bootstrap(bootstrapData([sessionView('t1', '/a.jsonl')]));
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(false);
  expect(client.calls.some((call) => call.method === 'session/resume')).toBe(false);

  const noPathStore = createLiveStore();
  noPathStore.getState().bootstrap(bootstrapData([]));
  const noPathClient = makeClient({});
  expect(await createLiveController(noPathClient, noPathStore).reloadSessionTrusted('ghost', true)).toBe(false);
  expect(noPathClient.calls).toEqual([]);
});

test('reloadSessionTrusted：stop 成功但 resume 失败——返回 false 且刷新 saved（History 可找回）', async () => {
  const client = makeClient({ 'session/resume': { ok: false, error: { kind: 'transient', face: 'busy' } } });
  const store = createLiveStore();
  store.getState().bootstrap(bootstrapData([sessionView('t1', '/a.jsonl')]));
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(false);
  expect(client.calls.some((call) => call.method === 'session/listSaved')).toBe(true);
});

test('reloadSessionTrusted：重开前非活跃会话——成功后不劫持 activeThread', async () => {
  const client = makeClient({
    'session/resume': { ok: true, data: sessionView('t9', '/a.jsonl') },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
    'session/listSaved': { ok: true, data: [] },
  });
  const store = createLiveStore();
  store.getState().bootstrap(bootstrapData([sessionView('t1', '/a.jsonl'), { ...sessionView('t2', '/b.jsonl'), cwd: '/w2', title: '别' }]));
  store.getState().setActiveThread('t2');
  expect(await createLiveController(client, store).reloadSessionTrusted('t1', true)).toBe(true);
  expect(store.getState().activeThreadId).toBe('t2');
});

test('agent 定义管理面：upsert/remove 透传 errorText 并刷新快照（身份键 = name+scope+project）', async () => {
  const definition: AgentDefinition = { name: 'search', description: 'd', systemPrompt: 'p', tools: null, model: null, scope: 'user', project: null };
  const client = makeClient({
    'agent/definitions': { ok: true, data: [definition] },
    'agent/upsert': { ok: false, error: { kind: 'name_conflict' } },
    'agent/remove': { ok: true, data: null },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  const key = { name: 'search', scope: 'user' as const, project: null };
  // upsert 失败：errorText 透传（表单内联），不刷新快照
  expect(await controller.upsertAgentDefinition(definition, null)).toBe('name_conflict');
  expect(store.getState().agentDefinitions).toEqual([]);
  // remove 成功：error null + 快照刷新
  expect(await controller.removeAgentDefinition(key)).toBeNull();
  expect(client.calls).toContainEqual({ method: 'agent/remove', params: key });
  expect(store.getState().agentDefinitions).toEqual([definition]);
});

test('steerSubagent：trim 校验 + 命令透传（agentId 寻址）+ 失败原因', async () => {
  const client = makeClient({ 'subagent/steer': { ok: false, error: { kind: 'thread_not_live' } } });
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.steerSubagent('t1', 's1', '   ')).toBe('empty_message');
  expect(await controller.steerSubagent('t1', 's1', ' 提速 ')).toBe('thread_not_live');
  expect(client.calls).toContainEqual({ method: 'subagent/steer', params: { threadId: 't1', agentId: 's1', message: '提速' } });

  const okClient = makeClient({});
  expect(await createLiveController(okClient, createLiveStore()).steerSubagent('t1', 's1', 'go')).toBeNull();
});

const startData = sessionView('t1', null);

test('createSession：permissionMode/thinkingLevel 是 session/start 原生参数，无后置应用命令', async () => {
  const client = makeClient({
    'session/start': { ok: true, data: startData },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
  });
  const outcome = await createLiveController(client, createLiveStore()).createSession({
    cwd: '/w',
    trusted: false,
    model: { provider: 'a', modelId: 'm' },
    thinkingLevel: 'high',
    permissionMode: 'plan',
  });
  expect(outcome).toEqual({ ok: true, threadId: 't1' });
  expect(client.calls.find((call) => call.method === 'session/start')?.params).toMatchObject({
    cwd: '/w',
    modelId: 'm',
    trusted: false,
    thinkingLevel: 'high',
    permissionMode: 'plan',
  });
  // hub 建线程即生效：无后置 setThinking / 权限写
  expect(client.calls.some((call) => call.method === 'session/setThinking')).toBe(false);
  expect(client.calls.some((call) => call.method === 'permission/setMode')).toBe(false);
});

test('createSession：不传可选项时不带可选字段；start 失败透传 errorText', async () => {
  const bare = makeClient({
    'session/start': { ok: true, data: startData },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
  });
  expect(await createLiveController(bare, createLiveStore()).createSession({ cwd: '/w' })).toEqual({ ok: true, threadId: 't1' });
  expect(bare.calls.find((call) => call.method === 'session/start')?.params).toEqual({ cwd: '/w', modelId: undefined, trusted: undefined });

  const failed = makeClient({ 'session/start': { ok: false, error: { kind: 'invalid_input', message: 'cwd_missing' } } });
  expect(await createLiveController(failed, createLiveStore()).createSession({ cwd: '/nope' })).toEqual({
    ok: false,
    reason: 'invalid_input：cwd_missing',
  });
});

test('症状回归：bootstrap 后即拉 hub 缺省（新任务页权限控件数据源，不再等进设置页才可见）', async () => {
  const client = makeClient({
    'app/bootstrap': { ok: true, data: bootstrapData([]) },
    'app/hubSettings': { ok: true, data: hubSettings },
  });
  const store = createLiveStore();
  await createLiveController(client, store).start();
  // 启动内 hub 缺省拉取是 fire-and-forget，让在途 promise 落地
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(client.calls.some((call) => call.method === 'app/hubSettings')).toBe(true);
  expect(store.getState().hubSettings).toEqual(hubSettings);
});
