import { describe, expect, test } from 'bun:test';

import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

import { createApiClient } from '../client';

/** 类型化代理映射表：每域方法 → IPC 方法名 + params 透传（收口前提：字符串只在此层）。 */

function recordingTransport() {
  const calls: Array<{ method: string; params: unknown }> = [];
  const transport = {
    invoke: <M extends ApiMethod>(method: M, params: ApiParams<M>): Promise<ApiOutcome<M>> => {
      calls.push({ method, params });
      return Promise.resolve({ ok: true, data: null } as ApiOutcome<M>);
    },
  };
  return { transport, calls };
}

describe('createApiClient 域方法映射（全量抽查 + 透传）', () => {
  test('session/thread 核心动词：方法名与 params 原样到桥', async () => {
    const { transport, calls } = recordingTransport();
    const api = createApiClient(transport);
    await api.session.prompt({ threadId: 't1', message: 'hi' });
    await api.thread.start({ cwd: '/w' });
    await api.session.steer({ threadId: 't1', agentId: 'a1', message: 'go' });
    expect(calls).toEqual([
      { method: 'session/prompt', params: { threadId: 't1', message: 'hi' } },
      { method: 'session/start', params: { cwd: '/w' } },
      { method: 'subagent/steer', params: { threadId: 't1', agentId: 'a1', message: 'go' } },
    ]);
  });

  test('十二域各抽一动词：方法名映射正确（词表漂移即此处红）', async () => {
    const { transport, calls } = recordingTransport();
    const api = createApiClient(transport);
    await api.models.list({});
    await api.agents.definitions({});
    await api.skills.list({});
    await api.dialog.respond({ requestId: 'r1', payload: {} });
    await api.files.read({ path: '/a', cwd: '/w' });
    await api.git.branches({ cwd: '/w' });
    await api.provider.upsert({ name: 'p' });
    await api.permission.mode({ threadId: 't1' });
    await api.command.list({});
    await api.app.bootstrap({});
    await api.app.openShell({ cwd: '/w', target: 'finder' });
    await api.session.stats({ threadId: 't1' });
    expect(calls.map((c) => c.method)).toEqual([
      'model/list', 'agent/definitions', 'skills/list', 'dialog/respond', 'file/read',
      'git/branches', 'provider/upsert', 'permission/mode', 'command/list', 'app/bootstrap',
      'shell/open', 'session/stats',
    ]);
  });

  test('失败 outcome 原样返回（代理零折叠——解码/文案在两端）', async () => {
    const transport = {
      invoke: () => Promise.resolve({ ok: false, error: { kind: 'unknown_thread' as const } }),
    };
    const api = createApiClient(transport);
    const outcome = await api.session.prompt({ threadId: '', message: '' });
    expect(outcome).toEqual({ ok: false, error: { kind: 'unknown_thread' } });
  });
});
