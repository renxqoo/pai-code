import { describe, expect, test } from 'bun:test';

import {
  deliverWorktreeNotice,
  worktreeNoticeText,
  type WorktreeNoticeDeps,
  type WorktreeNoticeKind,
  type WorktreeNoticeResult,
  type WorktreeNoticeThreadRow,
} from '../worktree-notice';

const tree = { branch: 'feat/login', path: '/w/.x-harness-user-worktrees/proj-feat-login', cwd: '/w/proj' };

type Recorded = {
  kinds: WorktreeNoticeKind[]
  notified: { threadId: string; source: string; kind: 'content'; text: string }[]
  registered: string[]
};

type NoticeInput = { threadId: string; source: string; kind: 'content'; text: string };

function harness(over: {
  list?: () => Promise<WorktreeNoticeResult | null>
  notify?: (input: NoticeInput) => Promise<WorktreeNoticeResult | null>
}): { deps: WorktreeNoticeDeps; seen: Recorded } {
  const seen: Recorded = { kinds: [], notified: [], registered: [] };
  const rows: WorktreeNoticeThreadRow[] = [{ threadId: 't1', cwd: '/w/proj', state: 'live', streaming: true }];
  const deps: WorktreeNoticeDeps = {
    listThreads: over.list ?? ((): Promise<WorktreeNoticeResult | null> => Promise.resolve({ ok: true, data: { threads: rows } })),
    notify:
      over.notify ??
      ((input: NoticeInput): Promise<WorktreeNoticeResult | null> => {
        seen.notified.push(input);
        return Promise.resolve({ ok: true, data: null });
      }),
    registerSessionTree: (threadId) => seen.registered.push(threadId),
    emit: (kind) => seen.kinds.push(kind),
  };
  return { deps, seen };
}

const settled = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('worktree 通告投递（SESSION-WORKTREE-WORKFLOW §1.3）', () => {
  test('live + streaming → 恰一条 content、登记 + busy', async () => {
    const { deps, seen } = harness({});
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['busy']);
    expect(seen.registered).toEqual(['t1']);
    expect(seen.notified).toEqual([
      { threadId: 't1', source: 'git-worktree', kind: 'content', text: worktreeNoticeText(tree) },
    ]);
  });

  test('live + 空闲 → idle（登记照做）', async () => {
    const { deps, seen } = harness({
      list: (): Promise<WorktreeNoticeResult | null> =>
        Promise.resolve({ ok: true, data: { threads: [{ threadId: 't1', cwd: '/w/proj', state: 'live' }] } }),
    });
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['idle']);
    expect(seen.registered).toEqual(['t1']);
    expect(seen.notified.length).toBe(1);
  });

  test('来源会话非 live（parked/dead）→ 零注入 deferred', async () => {
    const { deps, seen } = harness({
      list: (): Promise<WorktreeNoticeResult | null> =>
        Promise.resolve({ ok: true, data: { threads: [{ threadId: 't1', cwd: '/w/proj', state: 'parked' }] } }),
    });
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['deferred']);
    expect(seen.notified).toEqual([]);
    expect(seen.registered).toEqual([]);
  });

  test('来源表项缺席 / cwd 不符 → deferred', async () => {
    const missing = harness({
      list: (): Promise<WorktreeNoticeResult | null> => Promise.resolve({ ok: true, data: { threads: [] } }),
    });
    deliverWorktreeNotice(tree, 't1', missing.deps);
    await settled();
    expect(missing.seen.kinds).toEqual(['deferred']);

    const drifted = harness({
      list: (): Promise<WorktreeNoticeResult | null> =>
        Promise.resolve({ ok: true, data: { threads: [{ threadId: 't1', cwd: '/elsewhere', state: 'live' }] } }),
    });
    deliverWorktreeNotice(tree, 't1', drifted.deps);
    await settled();
    expect(drifted.seen.kinds).toEqual(['deferred']);
    expect(drifted.seen.notified).toEqual([]);
  });

  test('thread/list 不可用（hub 缺席/失败/抛拒）→ deferred', async () => {
    const lists: Array<() => Promise<WorktreeNoticeResult | null>> = [
      (): Promise<WorktreeNoticeResult | null> => Promise.resolve(null),
      (): Promise<WorktreeNoticeResult | null> => Promise.resolve({ ok: false }),
      (): Promise<WorktreeNoticeResult | null> => Promise.reject(new Error('boom')),
    ];
    for (const list of lists) {
      const { deps, seen } = harness({ list });
      deliverWorktreeNotice(tree, 't1', deps);
      await settled();
      expect(seen.kinds).toEqual(['deferred']);
      expect(seen.notified).toEqual([]);
    }
  });

  test('症状回归「notify 应答 ok:false 不得谎报通告已送达」：deferred 且不登记', async () => {
    const { deps, seen } = harness({
      notify: (input: NoticeInput): Promise<WorktreeNoticeResult | null> => {
        seen.notified.push(input);
        return Promise.resolve({ ok: false });
      },
    });
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['deferred']);
    expect(seen.registered).toEqual([]);
  });

  test('症状回归「notify 抛拒不得谎报通告已送达」：deferred 且不登记', async () => {
    const { deps, seen } = harness({
      notify: (input: NoticeInput): Promise<WorktreeNoticeResult | null> => {
        seen.notified.push(input);
        return Promise.reject(new Error('transport down'));
      },
    });
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['deferred']);
    expect(seen.registered).toEqual([]);
  });

  test('坏表项行降级跳过（不崩、按缺席走 deferred）', async () => {
    const { deps, seen } = harness({
      list: (): Promise<WorktreeNoticeResult | null> =>
        Promise.resolve({ ok: true, data: { threads: [null, 'junk', { threadId: 't1' }] } }),
    });
    deliverWorktreeNotice(tree, 't1', deps);
    await settled();
    expect(seen.kinds).toEqual(['deferred']);
    expect(seen.notified).toEqual([]);
  });

  test('通告模板要素（分支/树路径/勿改主仓）', () => {
    const text = worktreeNoticeText(tree);
    expect(text).toContain('branch feat/login');
    expect(text).toContain(tree.path);
    expect(text).toContain('do not modify the main worktree at /w/proj');
  });
});
