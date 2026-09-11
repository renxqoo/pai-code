import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { editUserMessage, forkUserMessage } from '../workspace-fork';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/** 分叉重发/编辑重发（C2 首次入测）：forkFromEntry 经 spy 换装控制分叉结果。 */

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
  jest.restoreAllMocks();
});

describe('workspace-fork', () => {
  test('autoResend：原样直发（含图片载荷），不回填草稿/附件/聚焦', async () => {
    const submit = jest.spyOn(workspaceActions, 'submitDraft').mockResolvedValue(null);
    jest.spyOn(workspaceActions, 'forkFromEntry').mockResolvedValue('new-thread');
    forkUserMessage('entry-1', '重发内容', [{ data: 'd', mimeType: 'image/png' }], true);
    await Promise.resolve();
    expect(submit).toHaveBeenCalledWith('重发内容', [{ type: 'image', data: 'd', mimeType: 'image/png' }]);
    expect(uiStore.getState().drafts).toEqual({});
    expect(uiStore.getState().composerRestore).toBe(null);
  });

  test('回填链：草稿写分叉出的新线程槽 + 图片一次性信号；不写旧会话键', async () => {
    liveStore.setState({ activeThreadId: 'old-thread' });
    jest.spyOn(workspaceActions, 'forkFromEntry').mockResolvedValue('new-thread');
    forkUserMessage('entry-1', '回填内容', [{ data: 'd', mimeType: 'image/png' }], false);
    await Promise.resolve();
    await Promise.resolve();
    expect(uiStore.getState().drafts['new-thread']).toBe('回填内容');
    expect('old-thread' in uiStore.getState().drafts).toBe(false);
    expect(uiStore.getState().composerRestore?.images).toHaveLength(1);
    expect(uiStore.getState().composerRestore?.token).toBeGreaterThan(0);
  });

  test('fork 失败（null）：无任何副作用', async () => {
    jest.spyOn(workspaceActions, 'forkFromEntry').mockResolvedValue(null);
    forkUserMessage('entry-1', 'x', [], false);
    await Promise.resolve();
    expect(uiStore.getState().drafts).toEqual({});
    expect(uiStore.getState().composerRestore).toBe(null);
  });

  test('editUserMessage：替换活跃线程草稿', () => {
    liveStore.setState({ activeThreadId: 't1' });
    editUserMessage('编辑后内容');
    expect(uiStore.getState().drafts.t1).toBe('编辑后内容');
  });
});
