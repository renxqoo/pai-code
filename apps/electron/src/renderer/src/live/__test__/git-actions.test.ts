import { describe, expect, test } from 'bun:test';

import type { BridgeClient } from '../client-invoke';
import { checkoutGitBranch, listGitBranches, searchFiles } from '../git-actions';

/** 只读工作区动作（文件搜索 / git 分支）：空 cwd 早退、结果透传、失败面原样返回。 */
function makeClient(outcomes: Record<string, { ok: true; data: unknown } | { ok: false; reason: string }>) {
  const calls: Array<{ method: string; params: unknown }> = [];
  const client: BridgeClient = {
    available: true,
    invoke: (method: string, params: unknown) => {
      calls.push({ method, params });
      return Promise.resolve((outcomes[method] ?? { ok: true as const, data: null }) as never);
    },
    subscribe: () => () => undefined,
  };
  return { client, calls };
}

describe('searchFiles', () => {
  test('空 cwd 直接返回 null（不发请求）', async () => {
    const { client, calls } = makeClient({});
    expect(await searchFiles(client, '', 'x')).toBeNull();
    expect(calls).toEqual([]);
  });

  test('成功透传列表；失败返回 null（弹层按空结果呈现）', async () => {
    const ok = makeClient({ 'file/search': { ok: true, data: ['a.ts'] } });
    expect(await searchFiles(ok.client, '/w', 'a')).toEqual(['a.ts']);
    expect(ok.calls[0]?.params).toEqual({ cwd: '/w', query: 'a' });

    const bad = makeClient({ 'file/search': { ok: false, error: { kind: 'cwd_forbidden' } } });
    expect(await searchFiles(bad.client, '/w', 'a')).toBeNull();
  });
});

describe('listGitBranches', () => {
  test('空 cwd 返回 cwd_not_allowed（与主进程门禁同 kind，调用方无需分支）', async () => {
    const { client, calls } = makeClient({});
    expect(await listGitBranches(client, '')).toEqual({ ok: false, error: { kind: 'cwd_not_allowed' } });
    expect(calls).toEqual([]);
  });

  test('非仓库空形态与失败面原样透传', async () => {
    const empty = makeClient({ 'git/branches': { ok: true, data: { isRepo: false, current: null, branches: [] } } });
    expect(await listGitBranches(empty.client, '/w')).toEqual({ ok: true, data: { isRepo: false, current: null, branches: [] } });

    const failed = makeClient({ 'git/branches': { ok: false, error: { kind: 'git_unavailable' } } });
    expect(await listGitBranches(failed.client, '/w')).toEqual({ ok: false, error: { kind: 'git_unavailable' } });
  });
});

describe('checkoutGitBranch', () => {
  test('空 cwd 早退；参数原样提交（create 透传）', async () => {
    const { client, calls } = makeClient({ 'git/checkout': { ok: true, data: { branch: 'dev' } } });
    expect(await checkoutGitBranch(client, '', 'dev', false)).toEqual({ ok: false, error: { kind: 'cwd_not_allowed' } });
    expect(await checkoutGitBranch(client, '/w', 'dev', true)).toEqual({ ok: true, data: { branch: 'dev' } });
    expect(calls[0]?.params).toEqual({ cwd: '/w', branch: 'dev', create: true });
  });

  test('失败原因透传（脏工作区/分支已存在）', async () => {
    const dirty = makeClient({ 'git/checkout': { ok: false, error: { kind: 'dirty_worktree' } } });
    expect(await checkoutGitBranch(dirty.client, '/w', 'dev', false)).toEqual({ ok: false, error: { kind: 'dirty_worktree' } });
    const dup = makeClient({ 'git/checkout': { ok: false, error: { kind: 'branch_exists' } } });
    expect(await checkoutGitBranch(dup.client, '/w', 'dev', true)).toEqual({ ok: false, error: { kind: 'branch_exists' } });
  });
});
