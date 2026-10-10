import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView } from '@x3code/contracts';

import { BranchMenu } from '../branch-menu';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import { callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';

/**
 * 分支行下拉接线（速览面板 Git 区）：面板 onSelect → checkout 动词的参数形态
 * （false = 不建分支）、创建分支弹窗提交 → checkout（create=true）、锁定守卫
 * （点击时反馈锁因不切换）、检出成功递增分支失效代次。
 * Portal 壳内入口走 fiber 直调第一跳，后续交互走真实 DOM。
 */

const VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };

type Over = Partial<Parameters<typeof BranchMenu>[0]>;

function mount(over: Over = {}): ReturnType<typeof render> {
  return render(
    <BranchMenu
      view={VIEW}
      current="main"
      loading={false}
      failed={false}
      cwd="/tmp/t38"
      lock={null}
      onOpenGraph={() => undefined}
      {...over}
    />,
  );
}

async function flushAsync(): Promise<void> {
  await React.act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

/** 通知条文本（真实 store 入口，不 spy——断言跑在真实通知面上）。 */
function noticeTexts(): readonly string[] {
  return liveStore.getState().notices.map((notice) => notice.text);
}

afterEach(() => {
  liveStore.getState().reset();
  uiStore.getState().reset();
  jest.restoreAllMocks();
});

describe('BranchMenu 切换接线', () => {
  test('面板选分支 → checkout（false = 不建分支）；成功递增分支失效代次', async () => {
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'dev' } });
    const revisionBefore = uiStore.getState().branchRevision;
    const view = mount();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/tmp/t38', 'dev', false);
    expect(uiStore.getState().branchRevision).toBe(revisionBefore + 1);
    view.unmount();
  });

  test('锁定：点击切分支 → 反馈锁因通知，不调 checkout', async () => {
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch');
    const view = mount({ lock: { runningCount: 2 } });
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(checkout).not.toHaveBeenCalled();
    expect(noticeTexts().join('\n')).toContain(copy.branch.lockReason(2));
    view.unmount();
  });

  test('切分支失败：原因走通知条（不吞错）', async () => {
    jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({
      ok: false,
      error: { kind: 'dirty_worktree' },
    });
    const view = mount();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(noticeTexts().join('\n')).toContain(copyOfError({ kind: 'dirty_worktree' }));
    view.unmount();
  });
});

describe('BranchMenu 创建分支接线', () => {
  test('创建弹窗表单提交 → checkout create=true；成功关闭弹窗', async () => {
    const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'feat/x' } });
    const view = mount();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
    await flushAsync();
    const dialog = [...document.body.querySelectorAll('[role="dialog"]')].at(-1) as HTMLDialogElement | undefined;
    expect(dialog).toBeDefined();
    const input = dialog?.querySelector('input');
    if (input !== undefined && input !== null) fireChange(input as HTMLInputElement, 'feat/x');
    await flushAsync();
    React.act(() => {
      dialog?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushAsync();
    expect(checkout).toHaveBeenCalledWith('/tmp/t38', 'feat/x', true);
    view.unmount();
  });

  test('创建失败：原因内联留在弹窗（改名重试现场保留）', async () => {
    jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: false, error: { kind: 'branch_exists' } });
    const view = mount();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
    await flushAsync();
    const dialog = [...document.body.querySelectorAll('[role="dialog"]')].at(-1) as HTMLDialogElement | undefined;
    const input = dialog?.querySelector('input');
    if (input !== undefined && input !== null) fireChange(input as HTMLInputElement, 'main');
    await flushAsync();
    React.act(() => {
      dialog?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushAsync();
    const still = [...document.body.querySelectorAll('[role="dialog"]')].at(-1) as HTMLDialogElement | undefined;
    expect(still?.textContent).toContain(copyOfError({ kind: 'branch_exists' }));
    view.unmount();
  });
});