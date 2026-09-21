import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';
import { copy } from '@/strings';

/** 会话级操作（compact / rename / thinking）的命令透传与失败原因表驱动回归。 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

function makeClient(
  results: Record<string, Outcome>,
): BridgeClient & { calls: Array<{ method: string; params: unknown }>; emitToController: (event: unknown) => void } {
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

test('renameSession 成功返回 true 并发送 trim 后的名字', async () => {
  const client = makeClient({});
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.renameSession('t1', '  新标题  ')).toBe(true);
  expect(client.calls).toContainEqual({ method: 'session/setName', params: { threadId: 't1', name: '新标题' } });
});

test('renameSession 失败返回 false（不发通知，通知由 hook 层负责）', async () => {
  const client = makeClient({ 'session/setName': { ok: false, reason: 'not_found' } });
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.renameSession('t1', 'x')).toBe(false);
});

test('renameSession trim 后为空直接拒绝且不发出命令', async () => {
  const client = makeClient({});
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.renameSession('t1', '   ')).toBe(false);
  expect(client.calls.filter((call) => call.method === 'session/setName')).toEqual([]);
});

test('submitDraft 携带 images 透传（prompt 单一通路）；纯图消息合法投递、全空拒绝', async () => {
  const images = [{ type: 'image' as const, data: 'aGk=', mediaType: 'image/png' }];
  const client = makeClient({});
  const store = createLiveStore();
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] }, hostPhase: 'ready' });
  const controller = createLiveController(client, store);
  expect(await controller.submitDraft('t1', 'hello', images)).toBeNull();
  expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({
    threadId: 't1',
    message: 'hello',
    streamingBehavior: 'followUp',
    images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }],
  });

  const noImages = makeClient({});
  await createLiveController(noImages, createLiveStore()).submitDraft('t1', 'hello');
  expect(noImages.calls.find((call) => call.method === 'session/prompt')?.params).not.toHaveProperty('images');

  // fork 重试纯图消息：空文本 + 图片照样投递；文本图片全空才拒
  const imageOnly = makeClient({});
  expect(await createLiveController(imageOnly, createLiveStore()).submitDraft('t1', '', images)).toBeNull();
  expect(imageOnly.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({ message: '', images });
  const empty = makeClient({});
  expect(await createLiveController(empty, createLiveStore()).submitDraft('t1', '   ')).toBe('empty_message');
  expect(empty.calls.some((call) => call.method === 'session/prompt')).toBe(false);
});

test('runBash：置位/清位 bashRunning、发出命令、随后对账拉取', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] }, hostPhase: 'ready' });
  const seen: boolean[] = [];
  const unsubscribe = store.subscribe((state) => {
    seen.push(Object.values(state.threads)[0]?.bashRunning ?? false);
  });
  expect(await controller.runBash('t1', '  git status ')).toBeNull();
  unsubscribe();
  expect(client.calls).toContainEqual({ method: 'session/bash', params: { threadId: 't1', command: 'git status' } });
  expect(client.calls.some((call) => call.method === 'session/entries')).toBe(true);
  expect(seen[0]).toBe(true);
  expect(seen[seen.length - 1]).toBe(false);
});

test('runBash 空命令拒绝且不发命令；abortBash 发出中止', async () => {
  const client = makeClient({});
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.runBash('t1', '   ')).toBe('empty_command');
  expect(client.calls.some((call) => call.method === 'session/bash')).toBe(false);
  await controller.abortBash('t1');
  expect(client.calls).toContainEqual({ method: 'session/abortBash', params: { threadId: 't1' } });
});

test('submitDraft 显式 steer 模式以 streamingBehavior=steer 投递；默认按 followUp', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] }, hostPhase: 'ready' });
  store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
  expect(await controller.submitDraft('t1', '改需求', undefined, 'steer')).toBeNull();
  expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({
    threadId: 't1',
    message: '改需求',
    streamingBehavior: 'steer',
  });
  expect(await controller.submitDraft('t1', '排队消息')).toBeNull();
  expect(
    client.calls
      .filter((call) => call.method === 'session/prompt')
      .map((call) => (call.params as { streamingBehavior?: string }).streamingBehavior),
  ).toEqual(['steer', 'followUp']);
});

test('症状回归：对话已结束但 streaming 镜像滞留 true 时，submitDraft 仍走 prompt 立即发送（不投进永不消费的队列）', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] }, hostPhase: 'ready' });
  // 宿主死亡/漏 settle 场景下镜像滞留：本地 streaming=true 而会话实际空闲
  store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
  expect(store.getState().threads['t1']?.streaming).toBe(true);
  expect(await controller.submitDraft('t1', '对话结束后的新消息')).toBeNull();
  // 选路不依赖本地镜像：唯一通路是 prompt+streamingBehavior（hub 空闲 = 立即发送）
  expect(client.calls.filter((call) => call.method === 'session/prompt')).toHaveLength(1);
  expect(client.calls.some((call) => call.method === 'session/followUp' || call.method === 'session/steer')).toBe(false);
});

test('forkSession：命令形状（seq = WAL 行号）、新会话激活与旧线程镜像终态化', async () => {
  const client = makeClient({
    'session/fork': { ok: true, data: { threadId: 't-fork', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '分叉', model: null, thinkingLevel: null, lastActivityAt: 0 } },
    'session/entries': { ok: true, data: { items: [], cursor: null } },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  // 旧线程处于流式（fork 常发生在生成中改主意向）：换轨后不得滞留
  store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
  expect(await controller.forkSession('t1', 9)).toEqual({ ok: true, threadId: 't-fork' });
  expect(client.calls).toContainEqual({ method: 'session/fork', params: { threadId: 't1', seq: 9, position: 'before' } });
  expect(store.getState().activeThreadId).toBe('t-fork');
  expect(store.getState().threads['t1']?.streaming).toBe(false);
});

test('selectThinking 成功：命令透传、无通知', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  await createLiveController(client, store).selectThinking('t1', 'high');
  expect(client.calls).toContainEqual({ method: 'session/setThinking', params: { threadId: 't1', level: 'high' } });
  expect(store.getState().notices).toEqual([]);
});

test('selectThinking 词表外值：本地拒绝不发命令，thinkingInvalid 通知', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  await createLiveController(client, store).selectThinking('t1', 'ultra');
  expect(client.calls.some((call) => call.method === 'session/setThinking')).toBe(false);
  expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.thinkingInvalid]);
});

test('症状回归「思考档被 hub 拒绝但 UI 无反馈」：失败 reason 进通知条（thinkingRejected）', async () => {
  const client = makeClient({ 'session/setThinking': { ok: false, reason: 'level not supported by model' } });
  const store = createLiveStore();
  await createLiveController(client, store).selectThinking('t1', 'high');
  expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.thinkingRejected('level not supported by model')]);
});

test('forkSession 失败带原因不切会话（hub 拒绝原因交上层文案分派）', async () => {
  const client = makeClient({ 'session/fork': { ok: false, reason: 'thread is streaming' } });
  const store = createLiveStore();
  expect(await createLiveController(client, store).forkSession('t1', 9)).toEqual({ ok: false, reason: 'thread is streaming' });
  expect(store.getState().activeThreadId).toBeNull();
});

test('症状回归「思考档未应用：invalid_params」：空舞台（无活跃会话）下会话域动作不发射定址命令', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  await controller.selectThinking('', 'high');
  await controller.selectModel('', 'glm', 'glm-5.3');
  await controller.stopActiveTurn('');
  await controller.abortBash('');
  expect(await controller.submitDraft('', '你好')).toBe('no_active_session');
  expect(await controller.runBash('', 'ls -la')).toBe('no_active_session');
  // 无一条定址命令到达桥：threadId 空串过不了主进程 schema，只会换回 invalid_params 密文
  expect(client.calls).toEqual([]);
  // 直执行 bash 不落任何本地在跑镜像（bashStarted 未被触碰）
  expect(Object.keys(store.getState().threads)).toEqual([]);
  // 菜单类动作给可行动通知（pushNotice 按文本去重——两条同文收敛为一条）；停止/中止天然幂等静默；
  // 投递 reason 交通知层翻译
  expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.noActiveSession]);
});

test('selectModel hub 拒绝：模型未切换通知（选择未生效可见，与思考档同型）', async () => {
  const client = makeClient({ 'session/setModel': { ok: false, reason: 'unknown model' } });
  const store = createLiveStore();
  await createLiveController(client, store).selectModel('t1', 'glm', 'glm-4.7');
  expect(client.calls).toContainEqual({ method: 'session/setModel', params: { threadId: 't1', provider: 'glm', modelId: 'glm-4.7' } });
  expect(store.getState().notices.map((notice) => notice.text)).toEqual([copy.flow.modelRejected('unknown model')]);
});

test('selectModel 成功：命令透传、无通知', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  await createLiveController(client, store).selectModel('t1', 'glm', 'glm-5.3');
  expect(client.calls).toContainEqual({ method: 'session/setModel', params: { threadId: 't1', provider: 'glm', modelId: 'glm-5.3' } });
  expect(store.getState().notices).toEqual([]);
});

/** 顺序应答客户端：prompt 首答 Unknown threadId（僵尸视图症状），resume 回新 id。 */
function makeZombieClient(prompts: Outcome[], resume: Outcome): BridgeClient & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    calls,
    available: true,
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      if (method === 'session/prompt') return Promise.resolve((prompts.shift() ?? { ok: true as const, data: null }) as never);
      if (method === 'session/resume') return Promise.resolve(resume as never);
      return Promise.resolve({ ok: true as const, data: null } as never);
    },
    subscribe: () => () => undefined,
  };
}

function seedLiveSession(threadId: string, sessionPath: string | null): ReturnType<typeof createLiveStore> {
  const store = createLiveStore();
  store.getState().bootstrap({
    sessions: [{
      threadId, cwd: '/tmp/pai', sessionPath, title: '会话', state: 'live' as const, streaming: false,
      model: 'glm/glm-5.3', thinkingLevel: null, lastActivityAt: 1,
    }],
    saved: [], models: [], providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] },
    hostPhase: 'ready',
  });
  return store;
}

test('症状回归「消息未发送（Unknown threadId）」：僵尸视图自愈——按会话文件强制重锚后以新 id 重投一次', async () => {
  const client = makeZombieClient(
    [{ ok: false, reason: 'Unknown threadId' }, { ok: true, data: null }],
    { ok: true, data: { threadId: 't2' } },
  );
  const store = seedLiveSession('t1', '/s/t1/events.jsonl');
  expect(await createLiveController(client, store).submitDraft('t1', '你好')).toBeNull();
  // 重锚恰一次；投递先打旧 id、再打新 id；活跃线程随重锚翻到新 id
  expect(client.calls.filter((call) => call.method === 'session/resume')).toHaveLength(1);
  expect(client.calls.filter((call) => call.method === 'session/prompt').map((call) => (call.params as { threadId: string }).threadId)).toEqual(['t1', 't2']);
  expect(store.getState().activeThreadId).toBe('t2');
});

test('自愈重锚失败/无会话文件：按原 reason 上抛（不无限重试、不发无用 resume）', async () => {
  const failedResume = makeZombieClient([{ ok: false, reason: 'Unknown threadId' }], { ok: false, reason: 'resume busy' });
  const failedStore = seedLiveSession('t1', '/s/t1/events.jsonl');
  expect(await createLiveController(failedResume, failedStore).submitDraft('t1', '你好')).toBe('Unknown threadId');
  expect(failedResume.calls.filter((call) => call.method === 'session/prompt')).toHaveLength(1);

  const noPath = makeZombieClient([{ ok: false, reason: 'Unknown threadId' }], { ok: true, data: { threadId: 't2' } });
  const noPathStore = seedLiveSession('t1', null);
  expect(await createLiveController(noPath, noPathStore).submitDraft('t1', '你好')).toBe('Unknown threadId');
  expect(noPath.calls.some((call) => call.method === 'session/resume')).toBe(false);
});
