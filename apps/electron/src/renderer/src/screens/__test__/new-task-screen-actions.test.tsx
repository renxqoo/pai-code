import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView } from '@x3code/contracts';

import { render } from '@/testing/render';
import { callProp, callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { store as liveStore } from '@/live/workspace-runtime';
import { initialThreadState } from '@/live/live-thread-state';
import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';

import { NewTaskScreen } from '../new-task-screen';
import type { NewTaskStart } from '../start-task';

/**
 * 新建任务页动作面：创建分支弹窗（建分支并检出）、提交链（onCreate 透传）、
 * 切分支点击时检查、选模型/目录等。Portal 壳内入口 fiber 直调第一跳，弹窗/表单走真实 DOM。
 */

const REPO_VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };

type Seen = {
  starts: Array<{ cwd: string }>
  checkouts: Array<{ cwd: string; branch: string; create: boolean }>
  picked: number
  closed: number
  notices: string[]
};

function mountFlow(over: Partial<Parameters<typeof NewTaskScreen>[0]> = {}): { seen: Seen; view: ReturnType<typeof render> } {
  const seen: Seen = { starts: [], checkouts: [], picked: 0, closed: 0, notices: [] };
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
      onPickDirectory={() => {
        seen.picked += 1;
        return Promise.resolve(null);
      }}
      onCreate={(input: NewTaskStart) => {
        seen.starts.push({ cwd: input.cwd });
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

async function createViaDialog(view: ReturnType<typeof render>, name: string): Promise<void> {
  expect(callPropIn(view.container, ['onOpenGraph'], 'onCreate')).toBe(true);
  const dialog = dialogOf(view);
  fireChange(dialog.querySelector('input') as HTMLInputElement, name);
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

describe('创建弹窗（建分支并检出）', () => {
  test('提交 → checkout create=true，弹窗关闭', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    await createViaDialog(view, 'feat/new');
    expect(seen.checkouts).toEqual([{ cwd: '/w/app', branch: 'feat/new', create: true }]);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
    liveStore.getState().reset();
  });

  test('创建失败：原因内联回弹窗（改名重试现场保留）', async () => {
    const { seen, view } = mountFlow({
      onCheckoutBranch: () => Promise.resolve({ ok: false, error: { kind: 'branch_exists' } }),
    });
    await flushAsync();
    await createViaDialog(view, 'feat/new');
    expect(dialogOf(view).textContent ?? '').toContain(copyOfError({ kind: 'branch_exists' }));
    expect(seen.starts).toEqual([]);
    view.unmount();
    liveStore.getState().reset();
  });
});

describe('提交链', () => {
  test('提交首条消息 → 会话以所选目录开始并关页', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    sendFirstMessage(view);
    await flushAsync();
    expect(seen.starts).toEqual([{ cwd: '/w/app' }]);
    expect(seen.closed).toBe(1);
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

  test('运行中锁定：点击切分支 → 反馈锁因不切换', async () => {
    const { seen, view } = mountFlow();
    liveStore.setState({
      sessions: {
        't-run': {
          threadId: 't-run',
          cwd: '/w/app',
          sessionPath: '/w/app/s/t-run.jsonl',
          title: '运行中会话',
          state: 'live',
          streaming: false,
          model: 'glm/glm-4.7',
          thinkingLevel: null,
          lastActivityAt: Date.now(),
        },
      },
      threads: { 't-run': { ...initialThreadState, streaming: true } },
    });
    await flushAsync();
    expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
    await flushAsync();
    expect(seen.checkouts).toEqual([]);
    expect(seen.notices.length).toBeGreaterThan(0);
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

  test('选工作区：目录弹窗 onSelect → 项目段换名', async () => {
    const { seen, view } = mountFlow();
    await flushAsync();
    expect(callPropIn(view.container, ['onTrustedChange', 'onOpenFolder'], 'onSelect', '/w/cli')).toBe(true);
    await flushAsync();
    expect(view.container.textContent ?? '').toContain('cli');
    expect(seen.starts).toEqual([]);
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
