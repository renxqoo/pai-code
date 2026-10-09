/**
 * 症状：手机端发送失败只显示「未知错误」，无从判断是权限不足、
 * 会话失效还是桌面端不可用。失败原因走 CommandError {code,message}；
 * 形状缺失或不成形时客户端须给出显式缺因标记而不是空原因。
 */
import { describe, expect, it } from '@jest/globals';
import type { CommandError } from '@paiapp/relay-protocol';

import { createBridgeClient, type ClientTransportFace } from '../../transport/client';
import { copyReason } from '@/strings/zh';

/** 内存传输桩：按脚本回放应答。 */
function transportOf(reply: { success: boolean; error?: unknown }): ClientTransportFace {
  return {
    sendCommand: () => Promise.resolve(true),
    waitResponse: () => Promise.resolve({ id: '', command: '', ...reply } as Awaited<ReturnType<ClientTransportFace['waitResponse']>>),
  };
}

async function failureOf(error: unknown): Promise<string | undefined> {
  const client = createBridgeClient({ transport: transportOf({ success: false, error }) });
  const outcome = (await client.invoke('session/prompt', { threadId: 't1', message: 'hi' })) as { ok: boolean; error: { message?: string } };
  expect(outcome.ok).toBe(false);
  return outcome.error.message;
}

describe('invoke 失败原因可见性（症状：发送失败只显示未知错误）', () => {
  it('成功路径：data 经响应映射层直通', async () => {
    const client = createBridgeClient({ transport: transportOf({ success: true }) });
    await expect(client.invoke('session/abort', { threadId: 't1' })).resolves.toEqual({ ok: true, data: undefined });
  });

  it('网关拒绝的 code 原样上抛，展示层可映射成中文原因', async () => {
    const reason = await failureOf({ code: 'scope-denied' } satisfies CommandError);
    expect(reason).toBe('scope-denied');
    expect(copyReason(reason)).toBe('设备权限不足，请在桌面端调整设备作用域');
  });

  it('host 的错误码到达设备面（此前整段被丢，只剩未知错误）', async () => {
    const reason = await failureOf({ code: 'thread_not_live', message: 'thread parked by idle retire' } satisfies CommandError);
    expect(reason).toBe('thread_not_live');
    expect(copyReason(reason)).not.toBe('未知错误');
  });

  it('错误形状缺失或不成形时给出 no_reason 标记（不再是裸 transient 无原因）', async () => {
    for (const junk of [undefined, null, 'scope-denied', [], { message: '无 code' }, { code: '' }, { code: 7 }]) {
      const reason = await failureOf(junk);
      expect(reason).toBe('no_reason');
      expect(copyReason(reason)).not.toBe('未知错误');
    }
  });

  it('发不出去（未连接）：host_unavailable 有明确中文原因', () => {
    expect(copyReason('host_unavailable')).toBe('桌面端不可用');
  });

  it('未知错误码原样展示（可诊断性优先，不吞成统一文案）', () => {
    expect(copyReason('brand_new_code')).toBe('brand_new_code');
    expect(copyReason(undefined)).toBe('未知错误');
  });
});