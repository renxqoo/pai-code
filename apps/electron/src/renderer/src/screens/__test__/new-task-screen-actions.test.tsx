import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView } from '@paiapp/contracts';

import { render } from '@/testing/render';
import { callProp, callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { store as liveStore } from '@/live/workspace-runtime';
import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';

import { NewTaskScreen } from '../new-task-screen';
import type { NewTaskStart } from '../start-task';

/**
 * 新建任务页动作面（合并弹窗形态）：创建弹窗开关分派 worktree/检出、已建树 chip（× 删除回滚）、
 * 提交链（会话出生在树里 + start 失败自动回滚）、切分支点击时检查、选模型/目录等。
 * Portal 壳内入口 fiber 直调第一跳，弹窗/chip/表单走真实 DOM。
 */

const REPO_VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };
const TREE_PATH = '/w/.x-harness-user-worktrees/app-feat-login';

type Seen = {
  created: Array<{ cwd: string; branch: string }>
  removed: Array<{ cwd: string; path: string }>
  starts: Array<{ cwd: string; worktreePath: string | null }>
  checkouts: Array<{ cwd: string; branch: string; create: boolean }>
  picked: number
  closed: number
  notices: string[]
};

function mountFlow(over: Partial<Parameters<typeof NewTaskScreen>[0]> = {}): { seen: Seen; view: ReturnType<typeof render> } {
  const seen: Seen = { created: [], removed: [], starts: [], checkouts: [], picked: 0, closed: 0, notices: [] };
  const view = render(
    <NewTaskScreen
      knownDirs={['/w/app', '/w/cli']}
      commands={[]}
      defaultCwd="/w/app"
      trustedDefault={false}
      defaultModelFor={() => 'glm/glm-4.7'}
      modelOptions={['glm/glm-4.7', 'glm/glm-5.3']}
      noModelsLabel={copy.composer.noModels}
      defaultPermissionMode="auto"
      permissionModes={['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']}
      onSearchFiles={() => Promise.resolve(null)}
      onListBranches={() => Promise.resolve({ ok: true, data: { ...REPO_VIEW, branches: [...REPO_VIEW.branches] } })}
      onListGraph={() => Promise.resolve({ ok: true, data: { isRepo: true, commits: [], truncated: false } })}
      onCheckoutBranch={(cwd, branch, create) => {
        seen.checkouts.push({ cwd, branch, create });
        return Promise.resolve({ ok: true, data: { branch } });
      }}
      onCreateWorktree={(cwd, branch) => {
        seen.created.push({ cwd, branch });
        return Promise.resolve({ ok: true, data: { path: TREE_PATH, branch, cwd, repoTop: cwd } });
      }}
      onRemoveWorktree={(cwd, path) => {
        seen.removed.push({ cwd, path });
        return Promise.resolve({ ok: true, data: null });
      }}
      onPickDirectory={() => {
        seen.picked += 1;
        return Promise.resolve(null);
      }}
      onCreate={(input: NewTaskStart) => {
        seen.starts.push({ cwd: input.cwd, worktreePath: input.worktreePath });
        return Promise.resolve(true);
      }}
      onClose={() => {
        seen.closed += 1;
      }}
      onNotify={(text: string) => {
        seen.notices.push(text);
      }}
      onDialogOpenChange={() => undefined}
      {...over}
    />,
  );
  return { seen, view };
}

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

async function createViaDialog(view: ReturnType<typeof render>, name: string, inWorktree: boolean): Promise<void> {
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
  await flushAsync();
}

function sendFirstMessage(view: ReturnType<typeof render>): void {
  React.act(() => {
    [...view.container.querySelectorAll('button')].find((b) => b.textContent?.trim() === copy.newTask.quickTasks[0])?.click();
  });
  React.act(() => {
    view.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('创建弹窗开关分派与 worktree 树 chip', () => {
  test('开关开：确认即建树 → chip 标记（× 删除回滚）', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    await createViaDialog(view, 'feat/login', true);
    expect(seen.created).toEqual([{ cwd: '/w/app', branch: 'feat/login' }]);
    expect(view.container.textContent ?? '').toContain(copy.branch.wtPendingChip('feat/login'));
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();

    const clear = [...view.container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === copy.branch.wtPendingClear,
    );
    React.act(() => {
      clear?.click();
    });
    await flushAsync();
    expect(seen.removed).toEqual([{ cwd: '/w/app', path: TREE_PATH }]);
    expect(view.container.textContent ?? '').not.toContain(copy.branch.wtPendingChip('feat/login'));
    view.unmount();
    liveStore.getState().reset();
  });

  test('开关关：建分支并检出（create=true，不建树不 chip）', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    await createViaDialog(view, 'feat/new', false);
    expect(seen.checkouts).toEqual([{ cwd: '/w/app', branch: 'feat/new', create: true }]);
    expect(seen.created).toEqual([]);
    expect(view.container.textContent ?? '').not.toContain(copy.branch.wtPendingChip('feat/new'));
    view.unmount();
    liveStore.getState().reset();
  });

  test('建树失败：原因内联回弹窗（改名重试现场保留），不 chip', async () => {
    const { seen, view } = mountFlow({
      onCreateWorktree: () => Promise.resolve({ ok: false, error: { kind: 'worktree_path_exists' } }),
    });
    await flushAsync();
    await createViaDialog(view, 'feat/login', true);
    const reopened = dialogOf(view);
    expect(reopened.textContent ?? '').toContain(copyOfError({ kind: 'worktree_path_exists' }));
    expect(view.container.textContent ?? '').not.toContain(copy.branch.wtPendingChip('feat/login'));
    expect(seen.starts).toEqual([]);
    view.unmount();
    liveStore.getState().reset();
  });

  test('症状回归「建树在途拒发不崩」：createWorktree 抛拒 → 报因内联、不建会话', async () => {
    const { seen, view } = mountFlow({
      onCreateWorktree: () => Promise.reject(new Error('transport down')),
    });
    await flushAsync();
    await createViaDialog(view, 'feat/x', true);
    expect(dialogOf(view).textContent ?? '').toContain('transport down');
    expect(seen.starts).toEqual([]);
    expect(seen.closed).toBe(0);
    view.unmount();
    liveStore.getState().reset();
  });
});

describe('提交链（会话出生在树里 + 自动回滚）', () => {
  test('已建树：会话以树路径开始并关页', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    await createViaDialog(view, 'feat/login', true);
    sendFirstMessage(view);
    await flushAsync();
    expect(seen.starts).toEqual([{ cwd: TREE_PATH, worktreePath: TREE_PATH }]);
    expect(seen.closed).toBe(1);
    expect(seen.removed).toEqual([]);
    view.unmount();
    liveStore.getState().reset();
  });

  test('症状回归「start 失败自动回滚」：建会话失败 → remove 回滚已建树、不关页', async () => {
    const { seen, view } = mountFlow({ onCreate: () => Promise.resolve(false) });
    await flushAsync();
    await createViaDialog(view, 'feat/login', true);
    sendFirstMessage(view);
    await flushAsync();
    expect(seen.removed).toEqual([{ cwd: TREE_PATH, path: TREE_PATH }]);
    expect(seen.closed).toBe(0);
    view.unmount();
    liveStore.getState().reset();
  });
});

describe('分支/目录动作', () => {
  test('面板切分支：onSelect → checkout（false = 不建分支）', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(seen.checkouts).toEqual([{ cwd: '/w/app', branch: 'dev', create: false }]);
    view.unmount();
    liveStore.getState().reset();
  });

  test('点击时检查：被占用 → 反馈原因不切换', async () => {
    const { seen, view } = mountFlow({
      onListBranches: () =>
        Promise.resolve({
          ok: true,
          data: { ...REPO_VIEW, branches: [...REPO_VIEW.branches], worktrees: [{ branch: 'dev', path: '/w/wt/dev' }] },
        }),
    });
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(seen.checkouts).toEqual([]);
    expect(seen.notices).toContain(copy.branch.occupiedBy('/w/wt/dev'));
    view.unmount();
    liveStore.getState().reset();
  });

  test('切分支失败：原因走通知条（不吞错）', async () => {
    const { seen, view } = mountFlow({
      onCheckoutBranch: () => Promise.resolve({ ok: false, error: { kind: 'dirty_worktree' } }),
    });
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(seen.notices).toEqual([copyOfError({ kind: 'dirty_worktree' })]);
    view.unmount();
    liveStore.getState().reset();
  });

  test('选工作区：目录弹窗 onSelect → 项目段换名（换目录清 worktree 树标记）', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    await createViaDialog(view, 'feat/login', true);
    expect(callPropIn(view.container, ['onTrustedChange', 'onOpenFolder'], 'onSelect', '/w/cli')).toBe(true);
    await flushAsync();
    expect(view.container.textContent ?? '').toContain('cli');
    expect(view.container.textContent ?? '').not.toContain(copy.branch.wtPendingChip('feat/login'));
    expect(seen.created).toEqual([{ cwd: '/w/app', branch: 'feat/login' }]);
    view.unmount();
    liveStore.getState().reset();
  });

  test('打开文件夹 → 系统目录选择；选模型/思考档动作接线', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    expect(callPropIn(view.container, ['onTrustedChange'], 'onOpenFolder')).toBe(true);
    expect(callProp(view.container, 'onSelectModel', 'glm/glm-5.3')).toBe(true);
    expect(callPropIn(view.container, ['value', 'options'], 'onSelect', copy.composer.effortDefault)).toBe(true);
    await flushAsync();
    expect(seen.picked).toBe(1);
    view.unmount();
    liveStore.getState().reset();
  });
});
