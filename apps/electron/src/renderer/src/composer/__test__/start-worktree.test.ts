import { describe, expect, test } from 'bun:test';

import type { ApiOutcome } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';

import { startWorktree, type StartWorktreeDeps } from '../start-worktree';

type Seen = { created: Array<{ cwd: string; branch: string; originThreadId: string }>; finished: number };

function harness(over: { create?: StartWorktreeDeps['createWorktree'] }): { deps: StartWorktreeDeps; seen: Seen } {
  const seen: Seen = { created: [], finished: 0 };
  const deps: StartWorktreeDeps = {
    createWorktree:
      over.create ??
      ((cwd: string, branch: string, originThreadId: string): Promise<ApiOutcome<'git/worktree/create'>> => {
        seen.created.push({ cwd, branch, originThreadId });
        return Promise.resolve({
          ok: true,
          data: { path: '/w/.x-harness-user-worktrees/app-feat-x', branch, cwd, repoTop: '/w/app' },
        });
      }),
    onCreated: () => {
      seen.finished += 1;
    },
  };
  return { deps, seen };
}

describe('startWorktree（会话页/pulse 确认动作）', () => {
  test('建树成功：收尾一次并返回 null', async () => {
    const { deps, seen } = harness({});
    expect(await startWorktree({ cwd: '/w/app', branch: 'feat/x', originThreadId: 't1' }, deps)).toBeNull();
    expect(seen.created).toEqual([{ cwd: '/w/app', branch: 'feat/x', originThreadId: 't1' }]);
    expect(seen.finished).toBe(1);
  });

  test('建树失败：返回弹窗内联原因、不收尾', async () => {
    const { deps, seen } = harness({
      create: (): Promise<ApiOutcome<'git/worktree/create'>> => Promise.resolve({ ok: false, error: { kind: 'worktree_path_exists' } }),
    });
    expect(await startWorktree({ cwd: '/w/app', branch: 'feat/x', originThreadId: 't1' }, deps)).toBe(
      copyOfError({ kind: 'worktree_path_exists' }),
    );
    expect(seen.finished).toBe(0);
  });
});
