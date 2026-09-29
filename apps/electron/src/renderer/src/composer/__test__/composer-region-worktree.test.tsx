import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { ComposerRegion } from '../composer-region';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import { callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { copy } from '@/strings';
import { copyOfError } from '@/lib/error-text';

/**
 * 分支面板旅程（合并弹窗形态）：创建弹窗开关分派 worktree/检出、三动作（前往/合并/清理）、
 * 切分支点击时检查（锁定/占用反馈原因）、真冲突弹清单。Portal 壳内入口 fiber 直调第一跳，
 * 弹窗本体走真实表单。
 */

function seedLive(): void {
  liveStore.setState({
    sessions: {
      t1: {
        threadId: 't1',
        cwd: '/tmp/t38',
        sessionPath: '/tmp/t38/s/t1.jsonl',
        title: '会话-t1',
        state: 'live',
        streaming: false,
        model: 'openai/gpt-5.3',
        thinkingLevel: null,
        lastActivityAt: Date.now(),
      },
    },
    activeThreadId: 't1',
    threads: { t1: { ...initialThreadState } },
    preferences: {
      defaultModel: null,
      onboarded: true,
      projectModels: {},
      pinnedSessions: [],
      trustedDefault: false,
      hiddenProjects: [],
      idleRecycleMinutes: 15,
      archivedSessions: [],
    },
  });
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
  jest.restoreAllMocks();
});

const flushAsync = async (): Promise<void> => {
  await React.act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

function dialogOf(view: ReturnType<typeof render>): HTMLElement {
  const node = [...view.container.querySelectorAll('[role="dialog"]')].at(-1);
  if (node === undefined) throw new Error('弹窗未挂载');
  return node as HTMLElement;
}

function mockBranches(extra: Record<string, unknown> = {}): void {
  jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
    ok: true,
    data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0, ...extra },
  });
}

function openCreateDialog(view: ReturnType<typeof render>): HTMLElement {
  expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
  return dialogOf(view);
}

function submitDialog(dialog: HTMLElement, name: string, inWorktree: boolean): void {
  fireChange(dialog.querySelector('input') as HTMLInputElement, name);
  if (inWorktree) {
    const row = dialog.querySelector('[role="switch"]');
    React.act(() => {
      (row as HTMLElement | null)?.click();
    });
  }
  React.act(() => {
    dialog.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('创建弹窗开关分派（worktree / 检出）', () => {


  test('开关开：建分支并在独立 worktree 中开始（来源 = 当前线程）→ 成功关窗', async () => {
    seedLive();
    mockBranches();
    const create = jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({
      ok: true,
      data: { path: '/w/.x-harness-user-worktrees/t38-feat-x', branch: 'feat/x', cwd: '/tmp/t38', repoTop: '/tmp/t38' },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    submitDialog(openCreateDialog(view), 'feat/x', true);
    await flushAsync();
    expect(create).toHaveBeenCalledWith('/tmp/t38', 'feat/x', 't1');
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  test('建树失败：原因内联在弹窗、不关窗（改名重试现场保留）', async () => {
    seedLive();
    mockBranches();
    jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({ ok: false, error: { kind: 'branch_exists' } });
    const view = render(<ComposerRegion />);
    await flushAsync();
    submitDialog(openCreateDialog(view), 'feat/x', true);
    await flushAsync();
    const reopened = dialogOf(view);
    expect(reopened.textContent ?? '').toContain(copyOfError({ kind: 'branch_exists' }));
    expect((reopened.querySelector('input') as HTMLInputElement).value).toBe('feat/x');
    view.unmount();
  });

  test('开关关：建分支并检出（create=true，不建树）', async () => {
    seedLive();
    mockBranches();
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'feat/new' } });
    const view = render(<ComposerRegion />);
    await flushAsync();
    submitDialog(openCreateDialog(view), 'feat/new', false);
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/tmp/t38', 'feat/new', true);
    view.unmount();
  });
});

describe('worktree 三动作与切分支（占用行动作面）', () => {
  const ENTRY = {
    path: '/w/.x-harness-user-worktrees/t38-feat-x',
    branch: 'feat/x',
    clean: false,
    merged: false,
    unmergedCount: 2,
    locked: false,
  };

  async function mountWithWorktrees(): Promise<ReturnType<typeof render>> {
    seedLive();
    mockBranches({ worktrees: [{ branch: 'feat/x', path: ENTRY.path }] });
    jest.spyOn(workspaceActions, 'listWorktrees').mockResolvedValue({ ok: true, data: { worktrees: [ENTRY] } });
    const view = render(<ComposerRegion />);
    await flushAsync();
    const trigger = [...view.container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === copy.composer.branchSegment,
    );
    React.act(() => {
      trigger?.click();
    });
    await flushAsync();
    return view;
  }

  test('清理：占用行动作 → 确认框（数据源 list 条目）→ 删除 → removeWorktree', async () => {
    const remove = jest.spyOn(workspaceActions, 'removeWorktree').mockResolvedValue({ ok: true, data: null });
    const view = await mountWithWorktrees();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onWorktreeAction', 'clean', ENTRY)).toBe(true);
    const dialog = dialogOf(view);
    expect(dialog?.textContent ?? '').toContain(copy.branch.wtCleanMain('feat/x', 2));
    React.act(() => {
      [...(dialog?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === copy.branch.wtCleanProceed)?.click();
    });
    await flushAsync();
    expect(remove).toHaveBeenCalledWith('/tmp/t38', ENTRY.path);
    view.unmount();
  });

  test('前往：占用行动作 → 打开新建任务页预填树 cwd', async () => {
    const view = await mountWithWorktrees();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onWorktreeAction', 'visit', ENTRY)).toBe(true);
    expect(uiStore.getState().newTaskOpen).toBe(true);
    expect(uiStore.getState().newTaskCwd).toBe(ENTRY.path);
    view.unmount();
  });

  test('合并回主仓：占用行动作 → mergeWorktree', async () => {
    const merge = jest.spyOn(workspaceActions, 'mergeWorktree').mockResolvedValue({ ok: true, data: null });
    const view = await mountWithWorktrees();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onWorktreeAction', 'merge', { ...ENTRY, clean: true, merged: true })).toBe(true);
    await flushAsync();
    expect(merge).toHaveBeenCalledWith('/tmp/t38', 'feat/x');
    view.unmount();
  });

  test('面板切分支：onSelect → checkout（false = 不建分支）', async () => {
    seedLive();
    mockBranches();
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'dev' } });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/tmp/t38', 'dev', false);
    view.unmount();
  });

  test('点击时检查：锁定/被占用 → 反馈原因不切换（行不禁用）', async () => {
    seedLive();
    liveStore.setState({ threads: { t1: { ...initialThreadState, streaming: true } } });
    mockBranches({ worktrees: [{ branch: 'feat/x', path: '/w/wt/feat-x' }] });
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'dev' } });
    const view = render(<ComposerRegion />);
    await flushAsync();
    // 运行中锁定：点击 → 锁因反馈，不切换
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).not.toHaveBeenCalled();
    expect(liveStore.getState().notices.map((n) => n.text)).toContain(copy.branch.lockReason(1));
    view.unmount();

    // 被 worktree 占用：点击 → 占用者路径反馈，不切换
    seedLive();
    mockBranches({ worktrees: [{ branch: 'feat/x', path: '/w/wt/feat-x' }] });
    const checkout2 = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'feat/x' } });
    const view2 = render(<ComposerRegion />);
    await flushAsync();
    expect(callPropIn(view2.container, ['onOpenGraph'], 'onSelect', 'feat/x')).toBe(true);
    await flushAsync();
    expect(checkout2).not.toHaveBeenCalled();
    expect(liveStore.getState().notices.map((n) => n.text)).toContain(copy.branch.occupiedBy('/w/wt/feat-x'));
    view2.unmount();
  });

  test('切分支真冲突：conflict_files → 冲突清单弹窗（知情裁决，不强切）', async () => {
    seedLive();
    mockBranches({ dirtyFiles: 1 });
    jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({
      ok: false,
      error: { kind: 'conflict_files', message: 'src/a.ts\tlib/b.ts' },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(view.container.textContent ?? '').toContain('src/a.ts');
    expect(view.container.textContent ?? '').toContain('lib/b.ts');
    view.unmount();
  });

  test('清理回滚失败：原因走通知条（孤儿树由「清理」双入口兜底）', async () => {
    seedLive();
    mockBranches({ worktrees: [{ branch: 'feat/x', path: ENTRY.path }] });
    jest.spyOn(workspaceActions, 'listWorktrees').mockResolvedValue({ ok: true, data: { worktrees: [ENTRY] } });
    jest.spyOn(workspaceActions, 'removeWorktree').mockResolvedValue({ ok: false, error: { kind: 'worktree_in_use' } });
    const view = await mountWithWorktrees();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onWorktreeAction', 'clean', ENTRY)).toBe(true);
    const dialog = dialogOf(view);
    React.act(() => {
      [...(dialog?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === copy.branch.wtCleanProceed)?.click();
    });
    await flushAsync();
    expect(liveStore.getState().notices.map((n) => n.text)).toContain(copyOfError({ kind: 'worktree_in_use' }));
    view.unmount();
  });

  test('面板底部动作开合接线：onCreate → 创建弹窗；onOpenGraph → 图谱拉取（开窗才拉）', async () => {
    seedLive();
    mockBranches();
    const listGraph = jest.spyOn(workspaceActions, 'listGitGraph').mockResolvedValue({
      ok: true,
      data: { isRepo: true, commits: [], truncated: false },
    });
    const view = render(<ComposerRegion />);
    await flushAsync();
    expect(listGraph).not.toHaveBeenCalled();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
    expect(callPropIn(view.container, ['onOpenGraph'], 'onOpenGraph')).toBe(true);
    await flushAsync();
    expect(listGraph).toHaveBeenCalled();
    view.unmount();
  });
});
