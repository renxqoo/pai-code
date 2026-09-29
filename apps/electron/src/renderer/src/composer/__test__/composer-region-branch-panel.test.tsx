import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { ComposerRegion } from '../composer-region';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import { callPropIn } from '@/testing/react-props';
import { fireChange } from '@/testing/change';
import { copy } from '@/strings';

/**
 * 分支面板接线（切换/创建/锁定守卫）：onSelect 与 onCreate 到 checkout 动词的
 * 参数形态、conflict_files 弹窗、锁定点击不切换（Portal 壳内入口走 fiber 直调第一跳）。
 */

const session = {
  threadId: 't1',
  cwd: '/tmp/t38',
  sessionPath: '/tmp/t38/s/t1.jsonl',
  title: 'T',
  state: 'live' as const,
  streaming: false,
  model: 'glm/glm-4.7',
  thinkingLevel: null,
  lastActivityAt: 1,
};

function seedLive(threads?: Record<string, Partial<LiveThreadState>>): void {
  const built: Record<string, LiveThreadState> = {};
  for (const [id, patch] of Object.entries(threads ?? { t1: {} })) {
    built[id] = { ...initialThreadState, ...patch };
  }
  liveStore.setState({ sessions: { t1: session }, activeThreadId: 't1', threads: built, models: [], preferences: {} as never });
}

async function flushAsync(): Promise<void> {
  await React.act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

afterEach(() => {
  liveStore.getState().reset();
  uiStore.getState().reset();
  jest.restoreAllMocks();
});

describe('ComposerRegion 分支面板接线（切换/创建/锁定）', () => {

test('面板切分支：onSelect → checkout（false = 不建分支）；成功 bump 分支代次', async () => {
  seedLive({});
  jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
    ok: true,
    data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
  });
  const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'dev' } });
  const revisionBefore = uiStore.getState().branchRevision;
  const view = render(<ComposerRegion />);
  await flushAsync();
  expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
  await flushAsync();
  expect(checkout).toHaveBeenCalledWith('/tmp/t38', 'dev', false);
  expect(uiStore.getState().branchRevision).toBe(revisionBefore + 1);
  view.unmount();
  });

test('切分支失败：conflict_files → 冲突清单弹窗（知情裁决）；其余失败走通知条', async () => {
  seedLive({});
  jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
    ok: true,
    data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
  });
  jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({
    ok: false,
    error: { kind: 'conflict_files', message: 'src/a.ts\tlib/b.ts' },
  });
  const view = render(<ComposerRegion />);
  await flushAsync();
  expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
  await flushAsync();
  const text = view.container.textContent ?? '';
  expect(text).toContain(copy.branch.conflictTitle);
  expect(text).toContain('src/a.ts');
  expect(text).toContain('lib/b.ts');
  view.unmount();
  });

test('锁定点击：反馈锁因不切换', async () => {
  liveStore.setState({
    sessions: { t1: { ...session, state: 'live' } },
    activeThreadId: 't1',
    threads: { t1: { ...initialThreadState, streaming: true } },
    models: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 15, archivedSessions: [] },
  });
  jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
    ok: true,
    data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
  });
  const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch');
  const view = render(<ComposerRegion />);
  await flushAsync();
  expect(callPropIn(view.container, ['onOpenGraph'], 'onSelect', 'dev')).toBe(true);
  await flushAsync();
  expect(checkout).not.toHaveBeenCalled();
  view.unmount();
  });

test('创建分支：弹窗表单提交 → checkout create=true', async () => {
  seedLive({});
  jest.spyOn(workspaceActions, 'listGitBranches').mockResolvedValue({
    ok: true,
    data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
  });
  const checkout = jest.spyOn(workspaceActions, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: { branch: 'feat/x' } });
  const view = render(<ComposerRegion />);
  await flushAsync();
  const trigger = [...view.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === copy.composer.branchSegment);
  React.act(() => {
    trigger?.click();
  });
  await flushAsync();
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
});
