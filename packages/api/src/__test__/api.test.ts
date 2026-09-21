import { describe, expect, test } from 'bun:test';

import type { HostCommandOutcome, PaiCommand } from '@paiapp/contracts';

import { createHubApi } from '../index';
import { decodeApiError } from '../errors';
import { createTransport } from '../transport';

/** 剧本假面（圈3 单测装置）：按命令 type 回放预设应答，记录调用。 */
function scriptHub(script: Record<string, HostCommandOutcome>): {
  request: (command: PaiCommand, timeoutMs?: number) => Promise<HostCommandOutcome>;
  calls: Array<{ command: PaiCommand; timeoutMs?: number }>;
} {
  const calls: Array<{ command: PaiCommand; timeoutMs?: number }> = [];
  return {
    calls,
    request: (command, timeoutMs) => {
      calls.push({ command, timeoutMs });
      return Promise.resolve(script[command.type] ?? { ok: true, data: null });
    },
  };
}

describe('transport 管线契约（T40 §2.3 审查处置 H1）', () => {
  test('catch 显式返回 transient/host_unavailable——命令结果永不丢失', async () => {
    const send = createTransport({ request: () => Promise.reject(new Error('bridge gone')) });
    const result = await send<null>({ type: 'thread/list' });
    expect(result).toEqual({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
  });

  test('onCall 观测者抛错不影响命令结果（隔离契约）', async () => {
    const outcomes: string[] = [];
    const send = createTransport({
      request: () => Promise.resolve({ ok: true, data: 'x' } as HostCommandOutcome),
      onCall: () => { outcomes.push('observer-throws'); throw new Error('observer bug'); },
    });
    const result = await send<string>({ type: 'thread/list' });
    expect(result).toEqual({ ok: true, data: 'x' });
    expect(outcomes).toEqual(['observer-throws']);
  });

  test('onCall 失败分支携带解码后的完整 ApiError（kind/face 不折平为 unknown）', async () => {
    const observed: Array<{ ok: boolean; error?: unknown }> = [];
    const send = createTransport({
      request: () => Promise.resolve({ ok: false, error: 'no dial' }),
      onCall: (_command, result) => {
        observed.push(result.ok ? { ok: true } : { ok: false, error: result.error });
      },
    });
    const result = await send<null>({ type: 'prompt' });
    expect(result).toEqual({ ok: false, error: { kind: 'transient', face: 'command_failed', message: 'no dial' } });
    expect(observed).toEqual([{ ok: false, error: { kind: 'transient', face: 'command_failed', message: 'no dial' } }]);
  });

  test('ack 命令（retire/steer）成功恒折叠 null（帧解码缺省 data 为 undefined）', async () => {
    const hub = createHubApi({
      request: () => Promise.resolve({ ok: true, data: undefined } as HostCommandOutcome),
    });
    expect(await hub.thread.retire({ threadId: 't1' })).toEqual({ ok: true, data: null });
    expect(await hub.agents.steer({ threadId: 't1', agentId: 'sa-1', message: '快' })).toEqual({ ok: true, data: null });
    expect(await hub.session.abortBash({ threadId: 't1' })).toEqual({ ok: true, data: null });
  });

  test('hub 对象错误解码为 kind；未登记 code 落兜底族原文透传', async () => {
    const face = scriptHub({
      'thread/set_keepalive': { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } },
      'thread/stop': { ok: false, error: { code: 'future_code', message: '明日错误' } },
      'thread/retire': { ok: false, error: 'busy' },
    });
    const hub = createHubApi({ request: face.request });
    expect(await hub.thread.setKeepalive({ threadId: 't1', keepalive: true })).toEqual({
      ok: false, error: { kind: 'unknown_thread', message: 'Unknown threadId' },
    });
    expect(await hub.thread.stop({ threadId: 't1' })).toEqual({
      ok: false, error: { kind: 'unregistered_code', code: 'future_code', message: '明日错误' },
    });
    expect(await hub.thread.retire({ threadId: 't1' })).toEqual({
      ok: false, error: { kind: 'transient', face: 'busy' },
    });
  });
});

describe('decodeApiError 全函数（永不抛）', () => {
  test('infra 串 → transient 面；未知串保留原文；垃圾输入落 command_failed', () => {
    expect(decodeApiError('host_not_running')).toEqual({ kind: 'transient', face: 'host_not_running' });
    expect(decodeApiError('weird new failure')).toEqual({ kind: 'transient', face: 'command_failed', message: 'weird new failure' });
    expect(decodeApiError(undefined)).toEqual({ kind: 'transient', face: 'command_failed' });
    expect(decodeApiError({ code: 1, message: null } as never)).toEqual({ kind: 'transient', face: 'command_failed', message: 'malformed error payload' });
  });
});

describe('域命令档位与透传（档位单一真相 TIMEOUTS——漏档长命命令会被 30s 误杀，全部钉住）', () => {
  test('default 档 30s：thread/list_saved；成功 data 透传', async () => {
    const face = scriptHub({});
    const hub = createHubApi({ request: face.request });
    expect(await hub.thread.listSaved({ cwd: '/w' })).toEqual({ ok: true, data: null });
    expect(face.calls).toContainEqual({ command: { type: 'thread/list_saved', cwd: '/w' }, timeoutMs: 30_000 });
  });

  test('prompt 10min / compact 30min / bash 24h 三档特殊面逐命令钉住', async () => {
    const face = scriptHub({});
    const hub = createHubApi({ request: face.request });
    await hub.session.prompt({ threadId: 't1', message: 'hi' });
    await hub.session.compact({ threadId: 't1' });
    await hub.session.bash({ threadId: 't1', command: 'ls' });
    expect(face.calls.find((call) => call.command.type === 'prompt')?.timeoutMs).toBe(600_000);
    expect(face.calls.find((call) => call.command.type === 'compact')?.timeoutMs).toBe(1_800_000);
    expect(face.calls.find((call) => call.command.type === 'bash')?.timeoutMs).toBe(86_400_000);
  });
});
