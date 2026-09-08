import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';

/** 会话级操作（compact / rename）的命令透传与失败原因表驱动回归。 */

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

test('compact 成功返回 null 并按 threadId 发命令', async () => {
  const client = makeClient({});
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.compact('t1')).toBeNull();
  expect(client.calls).toContainEqual({ method: 'session/compact', params: { threadId: 't1' } });
});

test.each([
  ['compact_rejected', 'compact_rejected'],
  ['stream_busy', 'stream_busy'],
])('compact 失败透传原因（%s）', async (_, reason) => {
  const client = makeClient({ 'session/compact': { ok: false, reason } });
  const controller = createLiveController(client, createLiveStore());
  expect(await controller.compact('t1')).toBe(reason);
});

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

test('submitDraft 携带 images 透传（prompt 单一通路）', async () => {
  const images = [{ type: 'image' as const, data: 'aGk=', mimeType: 'image/png' }];
  const client = makeClient({});
  const store = createLiveStore();
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
  const controller = createLiveController(client, store);
  expect(await controller.submitDraft('t1', 'hello', images)).toBeNull();
  expect(client.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({
    threadId: 't1',
    message: 'hello',
    streamingBehavior: 'followUp',
    images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
  });

  const noImages = makeClient({});
  await createLiveController(noImages, createLiveStore()).submitDraft('t1', 'hello');
  expect(noImages.calls.find((call) => call.method === 'session/prompt')?.params).not.toHaveProperty('images');
});

test('runBash：置位/清位 bashRunning、发出命令、随后对账拉取', async () => {
  const client = makeClient({});
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
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
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
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
  store.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] } });
  // 宿主死亡/漏 settle 场景下镜像滞留：本地 streaming=true 而会话实际空闲
  store.getState().applyEvent({ type: 'turnStarted', threadId: 't1', at: 1 }, 1);
  expect(store.getState().threads['t1']?.streaming).toBe(true);
  expect(await controller.submitDraft('t1', '对话结束后的新消息')).toBeNull();
  // 选路不依赖本地镜像：唯一通路是 prompt+streamingBehavior（hub 空闲 = 立即发送）
  expect(client.calls.filter((call) => call.method === 'session/prompt')).toHaveLength(1);
  expect(client.calls.some((call) => call.method === 'session/followUp' || call.method === 'session/steer')).toBe(false);
});

test('clearQueue 与 forkSession：命令形状与新会话激活', async () => {
  const client = makeClient({
    'session/fork': { ok: true, data: { threadId: 't-fork', cwd: '/w', sessionPath: '/a.jsonl', state: 'live', streaming: false, title: '分叉', model: null, thinkingLevel: null, lastActivityAt: 0 } },
  });
  const store = createLiveStore();
  const controller = createLiveController(client, store);
  await controller.clearQueue('t1');
  expect(client.calls).toContainEqual({ method: 'session/clearQueue', params: { threadId: 't1' } });

  expect(await controller.forkSession('t1', 'entry-9')).toBe('t-fork');
  expect(client.calls).toContainEqual({ method: 'session/fork', params: { threadId: 't1', entryId: 'entry-9', position: 'before' } });
  expect(store.getState().activeThreadId).toBe('t-fork');
});

test('forkSession 失败返回 null 不切会话', async () => {
  const client = makeClient({ 'session/fork': { ok: false, reason: 'entry_not_found' } });
  const store = createLiveStore();
  expect(await createLiveController(client, store).forkSession('t1', 'x')).toBeNull();
  expect(store.getState().activeThreadId).toBeNull();
});
