import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { copy } from '@/strings';

import { useNewTaskScreen } from '../use-new-task-screen';
import type { NewTaskScreenProps } from '../new-task-screen';
import type { NewTaskStart } from '../start-task';

/**
 * 新建任务页装配：建树反馈分句（无来源报「会话将在 <path> 中开始」，有来源走
 * worktreeNotice 事件不重复报）与 worktree 动作映射（来源定格）。
 */

type Slot = { props: NewTaskScreenProps | null };

function Probe({ slot }: { slot: Slot }): null {
  slot.props = useNewTaskScreen('/w/app');
  return null;
}

const START: NewTaskStart = {
  cwd: '/w/.x-harness-user-worktrees/app-feat-x',
  worktreePath: '/w/.x-harness-user-worktrees/app-feat-x',
  trusted: false,
  model: 'glm/glm-4.7',
  permissionMode: null,
  thinkingLevel: null,
  text: '开工',
  attachments: [],
};

afterEach(() => {
  jest.restoreAllMocks();
  liveStore.getState().reset();
  uiStore.getState().reset();
});

describe('useNewTaskScreen worktree 反馈与映射', () => {
  let unmountProbe: (() => void) | null = null;

  afterEach(() => {
    unmountProbe?.();
    unmountProbe = null;
  });

  async function mount(): Promise<Slot> {
    jest.spyOn(workspaceActions, 'fetchCommandPreview').mockResolvedValue([]);
    const slot: Slot = { props: null };
    const view = render(<Probe slot={slot} />);
    unmountProbe = view.unmount;
    await React.act(async () => {
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    });
    if (slot.props === null) throw new Error('props 未就绪');
    return slot;
  }

  test('无来源：弹窗建树成功 → 「会话将在 <path> 中开始」（通知在建树回调，不在提交链）', async () => {
    const startTask = jest.spyOn(workspaceActions, 'startTask').mockResolvedValue({ ok: true, threadId: 'nt1', sendFailed: false });
    const create = jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({
      ok: true,
      data: { path: START.worktreePath, branch: 'feat/x', cwd: START.worktreePath, repoTop: START.cwd },
    });
    const notices: string[] = [];
    jest.spyOn(workspaceActions, 'showNotice').mockImplementation((text: string) => {
      notices.push(text);
    });
    const slot = await mount();
    await React.act(async () => {
      await (slot.props as NewTaskScreenProps).onCreateWorktree(START.cwd, 'feat/x');
    });
    expect(create).toHaveBeenCalledWith(START.cwd, 'feat/x', null);
    await React.act(async () => {
      const ok = await (slot.props as NewTaskScreenProps).onCreate(START);
      expect(ok).toBe(true);
    });
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ cwd: START.cwd, text: '开工' }));
    expect(notices).toEqual([copy.branch.wtStartPending(START.worktreePath)]);
  });

  test('有来源：不在此报（busy/idle/deferred 分句走 worktreeNotice 事件）', async () => {
    jest.spyOn(workspaceActions, 'startTask').mockResolvedValue({ ok: true, threadId: 'nt1', sendFailed: false });
    const notices: string[] = [];
    jest.spyOn(workspaceActions, 'showNotice').mockImplementation((text: string) => {
      notices.push(text);
    });
    uiStore.getState().openNewTask('/w/app', 't-src');
    const slot = await mount();
    await React.act(async () => {
      await (slot.props as NewTaskScreenProps).onCreate(START);
    });
    expect(notices).toEqual([]);
  });

  test('建树动作映射携带来源定格（openNewTask 时刻的 threadId）', async () => {
    const create = jest.spyOn(workspaceActions, 'createWorktree').mockResolvedValue({
      ok: true,
      data: { path: '/w/wt', branch: 'feat/x', cwd: '/w/app', repoTop: '/w/app' },
    });
    uiStore.getState().openNewTask('/w/app', 't-src');
    const slot = await mount();
    await (slot.props as NewTaskScreenProps).onCreateWorktree('/w/app', 'feat/x');
    expect(create).toHaveBeenCalledWith('/w/app', 'feat/x', 't-src');
  });
});
