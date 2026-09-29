import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView } from '@paiapp/contracts';

import { render } from '@/testing/render';
import { callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { copy } from '@/strings';
import { copyOfError } from '@/lib/error-text';

import { BranchMenu } from '../branch-menu';

/**
 * 速览分支下拉旅程（合并弹窗形态）：创建弹窗开关分派 worktree/检出（来源 = activeThread）、
 * 切分支点击时检查（锁定/占用反馈原因）。Portal 壳内入口 fiber 直调第一跳，弹窗本体走真实表单。
 */

const VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };

afterEach(() => {
  jest.restoreAllMocks();
  liveStore.getState().reset();
  uiStore.getState().reset();
});

const flushAsync = async (): Promise<void> => {
  await React.act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

function menu(lock: { runningCount: number } | null = null): ReturnType<typeof render> {
  return render(
    <BranchMenu view={VIEW} current="main" loading={false} failed={false} cwd="/w/app" lock={lock} onOpenGraph={() => undefined} />,
  );
}

function dialogOf(view: ReturnType<typeof render>): HTMLElement {
  const node = [...view.container.querySelectorAll('[role="dialog"]')].at(-1);
  if (node === undefined) throw new Error('弹窗未挂载');
  return node as HTMLElement;
}

function submitDialog(view: ReturnType<typeof render>, name: string, inWorktree: boolean): void {
  expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
  const dialog = dialogOf(view);
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

describe('BranchMenu 创建弹窗开关分派', () => {
  test('开关开：建树（来源 = activeThread）→ 成功关窗', async () => {
    liveStore.setState({ activeThreadId: 't9' });
    const create = jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({
      ok: true,
      data: { path: '/w/.x-harness-user-worktrees/app-feat-x', branch: 'feat/x', cwd: '/w/app', repoTop: '/w/app' },
    });
    const view = menu();
    await flushAsync();
    submitDialog(view, 'feat/x', true);
    await flushAsync();
    expect(create).toHaveBeenCalledWith('/w/app', 'feat/x', 't9');
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  test('建树失败：原因内联在弹窗（改名重试现场保留）', async () => {
    liveStore.setState({ activeThreadId: 't9' });
    jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({ ok: false, error: { kind: 'worktree_nested' } });
    const view = menu();
    await flushAsync();
    submitDialog(view, 'feat/x', true);
    await flushAsync();
    expect(dialogOf(view).textContent ?? '').toContain(copy.branch.wtStartNested);
    view.unmount();
  });

  test('开关关：建分支并检出（create=true，不建树）', async () => {
    liveStore.setState({ activeThreadId: 't9' });
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'feat/new' } });
    const view = menu();
    await flushAsync();
    submitDialog(view, 'feat/new', false);
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/w/app', 'feat/new', true);
    view.unmount();
  });
});

describe('BranchMenu 切分支（点击时检查）', () => {
  test('onSelect → checkout；锁定时反馈锁因不切换', async () => {
    liveStore.setState({ activeThreadId: 't9' });
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'dev' } });
    const view = menu();
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/w/app', 'dev', false);
    view.unmount();

    const locked = menu({ runningCount: 1 });
    await flushAsync();
    expect(callPropIn(locked.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).toHaveBeenCalledTimes(1);
    expect(liveStore.getState().notices.map((n) => n.text)).toContain(copy.branch.lockReason(1));
    locked.unmount();
  });

  test('切分支失败：原因走通知条', async () => {
    liveStore.setState({ activeThreadId: 't9' });
    jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: false, error: { kind: 'dirty_worktree' } });
    const view = menu();
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(liveStore.getState().notices.map((n) => n.text)).toContain(copyOfError({ kind: 'dirty_worktree' }));
    view.unmount();
  });

  test('面板动作开合接线：onCreate 开弹窗；onOpenGraph 面板收起并上抛', async () => {
    let graph = 0;
    const view = render(
      <BranchMenu view={VIEW} current="main" loading={false} failed={false} cwd="/w/app" lock={null} onOpenGraph={() => { graph += 1; }} />,
    );
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
    expect(dialogOf(view)).toBeDefined();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onOpenGraph')).toBe(true);
    expect(graph).toBe(1);
    view.unmount();
  });
});
