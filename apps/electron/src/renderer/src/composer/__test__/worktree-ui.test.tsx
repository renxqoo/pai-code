import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView, WorktreeEntryView } from '@paiapp/contracts';

import { BranchPanel } from '../branch-panel';
import { WorktreeCleanDialog } from '../worktree-clean-dialog';
import { render } from '@/testing/render';

/** 开关动作区与清理确认框两级呈现（SESSION-WORKTREE-WORKFLOW §1.5/§8）。 */

const view = (over: Partial<GitBranchesView> = {}): GitBranchesView => ({
  isRepo: true,
  current: 'main',
  branches: ['main', 'feat/login'],
  dirtyFiles: 0,
  ...over,
});

const entry = (over: Partial<WorktreeEntryView> = {}): WorktreeEntryView => ({
  path: '/w/wt',
  branch: 'feat/login',
  clean: true,
  merged: false,
  unmergedCount: 3,
  ...over,
});

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  const all = [...container.querySelectorAll('button'), ...container.querySelectorAll('[role="button"]')];
  return all.find((b) => b.textContent === text) as HTMLButtonElement | undefined;
}

describe('BranchPanel worktree 动作区', () => {
  test('占用行渲染三动作；checkout 行禁用（被占用）', () => {
    const page = render(
      <BranchPanel
        view={view({ worktrees: [{ branch: 'feat/login', path: '/w/wt' }] })}
        loading={false}
        failed={false}
        busy={false}
        lock={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
        onOpenGraph={() => undefined}
        worktrees={[entry({ branch: 'feat/login' })]}
        onWorktreeAction={() => undefined}
      />,
    );
    const row = [...page.container.querySelectorAll('button')].find((b) => b.textContent?.includes('feat/login'));
    expect(row?.disabled).toBe(true);
    expect(findButton(page.container, '前往')).toBeDefined();
    expect(findButton(page.container, '合并回主仓')).toBeDefined();
    expect(findButton(page.container, '清理')).toBeDefined();
    page.unmount();
  });

  test('detached 树占位行（无合并动作，清理可达）', () => {
    const page = render(
      <BranchPanel
        view={view()}
        loading={false}
        failed={false}
        busy={false}
        lock={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
        onOpenGraph={() => undefined}
        worktrees={[entry({ branch: null, path: '/w/det' })]}
        onWorktreeAction={() => undefined}
      />,
    );
    expect(page.container.textContent?.includes('（分离 HEAD）')).toBe(true);
    expect(findButton(page.container, '合并回主仓')).toBeUndefined();
    page.unmount();
  });

  test('未传 worktrees → 不渲染动作区', () => {
    const page = render(
      <BranchPanel view={view()} loading={false} failed={false} busy={false} lock={null} onSelect={() => undefined} onCreate={() => undefined} onOpenGraph={() => undefined} />,
    );
    expect(findButton(page.container, '前往')).toBeUndefined();
    page.unmount();
  });

  test('三动作回调各触发一次（参数与条目匹配）', () => {
    const seen: Array<[string, string]> = [];
    const page = render(
      <BranchPanel
        view={view({ worktrees: [{ branch: 'feat/login', path: '/w/wt' }] })}
        loading={false}
        failed={false}
        busy={false}
        lock={null}
        onSelect={() => undefined}
        onCreate={() => undefined}
        onOpenGraph={() => undefined}
        worktrees={[entry({ branch: 'feat/login' })]}
        onWorktreeAction={(action, e) => { seen.push([action, e.branch ?? '']); }}
      />,
    );
    React.act(() => { findButton(page.container, '前往')?.click(); });
    React.act(() => { findButton(page.container, '合并回主仓')?.click(); });
    React.act(() => { findButton(page.container, '清理')?.click(); });
    expect(seen).toEqual([
      ['visit', 'feat/login'],
      ['merge', 'feat/login'],
      ['clean', 'feat/login'],
    ]);
    page.unmount();
  });
});

describe('WorktreeCleanDialog 两级呈现', () => {
  const dialog = (over: Partial<Parameters<typeof WorktreeCleanDialog>[0]>): ReturnType<typeof render> =>
    render(<WorktreeCleanDialog entry={entry()} busy={false} onConfirm={() => undefined} onClose={() => undefined} {...over} />);

  test('主句含分支与未合并数；口径句默认折叠，展开后可见', () => {
    const page = dialog({});
    expect(page.container.textContent?.includes('3 个提交未并入任何本地分支')).toBe(true);
    expect(page.container.textContent?.includes('squash-merge')).toBe(false);
    React.act(() => { findButton(page.container, '详情')?.click(); });
    expect(page.container.textContent?.includes('squash-merge')).toBe(true);
    page.unmount();
  });

  test('unmergedCount 缺省 → 主句无计数、无详情折叠', () => {
    const page = render(<WorktreeCleanDialog entry={entry({ unmergedCount: undefined })} busy={false} onConfirm={() => undefined} onClose={() => undefined} />);
    expect(page.container.textContent?.includes('将永久删除目录与分支「feat/login」。')).toBe(true);
    expect(findButton(page.container, '详情')).toBeUndefined();
    page.unmount();
  });

  test('locked 树：删除前置禁用 + 锁定说明在场', () => {
    const page = render(<WorktreeCleanDialog entry={entry({ locked: true })} busy={false} onConfirm={() => undefined} onClose={() => undefined} />);
    expect((findButton(page.container, '删除') as HTMLButtonElement).disabled).toBe(true);
    expect(page.container.textContent?.includes('锁定')).toBe(true);
    page.unmount();
  });

  test('busy 禁用；解除后确认回调可达', () => {
    let confirmed = false;
    const page = render(<WorktreeCleanDialog entry={entry()} busy onConfirm={() => { confirmed = true; }} onClose={() => undefined} />);
    expect((findButton(page.container, '删除') as HTMLButtonElement).disabled).toBe(true);
    page.rerender(<WorktreeCleanDialog entry={entry()} busy={false} onConfirm={() => { confirmed = true; }} onClose={() => undefined} />);
    React.act(() => { findButton(page.container, '删除')?.click(); });
    expect(confirmed).toBe(true);
    page.unmount();
  });
});
