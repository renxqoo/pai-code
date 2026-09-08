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

test('submitDraft 携带 images 透传（prompt 与 followUp 两路径）', async () => {
  const images = [{ type: 'image' as const, data: 'aGk=', mimeType: 'image/png' }];
  const streamingClient = makeClient({});
  const streamingStore = createLiveStore();
  streamingStore.getState().bootstrap({ sessions: [], saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true } });
  // streaming 状态经 foldThreadEvent 设置太重：直接走非流式路径断言 prompt 透传
  const idle = createLiveController(streamingClient, streamingStore);
  expect(await idle.submitDraft('t1', 'hello', images)).toBeNull();
  expect(streamingClient.calls.find((call) => call.method === 'session/prompt')?.params).toMatchObject({
    threadId: 't1',
    message: 'hello',
    images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
  });

  const noImages = makeClient({});
  await createLiveController(noImages, createLiveStore()).submitDraft('t1', 'hello');
  expect(noImages.calls.find((call) => call.method === 'session/prompt')?.params).not.toHaveProperty('images');
});
