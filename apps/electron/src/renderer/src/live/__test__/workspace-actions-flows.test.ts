import { afterEach, describe, expect, jest, test } from 'bun:test';

import { controller, store, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { initialThreadState } from '@/live/live-thread-state';
import { copy } from '@/strings';

/** 动作层失败路补测（设置偏好/重命名/子代理代答/水化重试/复制）：失败不吞、提示查表文案。 */

afterEach(() => {
  store.getState().reset();
  uiStore.getState().reset();
  jest.restoreAllMocks();
});

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('workspace-actions 失败路', () => {
  test('偏好写失败：setDefaultModel/completeOnboarding/restartOnboarding 各报保存失败', async () => {
    jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    workspaceActions.setDefaultModel('glm/glm-5.3');
    await flush();
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.settings.preferenceSaveFailed);

    store.getState().reset();
    workspaceActions.completeOnboarding();
    await flush();
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.settings.preferenceSaveFailed);

    store.getState().reset();
    const restarted = await workspaceActions.restartOnboarding();
    expect(restarted).toBe(false);
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.settings.preferenceSaveFailed);
  });

  test('restartOnboarding 成功返回 true 零通知；saveGeneralPreferences/saveRelay 失败各自文案', async () => {
    jest.spyOn(controller, 'updatePreferences').mockResolvedValueOnce({} as never);
    expect(await workspaceActions.restartOnboarding()).toBe(true);
    expect(store.getState().notices).toEqual([]);

    jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    expect(await workspaceActions.saveGeneralPreferences({ trustedDefault: true })).toBe(false);
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.settings.generalSaveFailed);

    store.getState().reset();
    expect(await workspaceActions.saveRelay({ enabled: true, port: 0, token: '' })).toBe(false);
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.settings.relaySaveFailed);
  });

  test('renameSession 失败报 renameFailed 且返回 false', async () => {
    jest.spyOn(controller, 'renameSession').mockResolvedValue(false);
    expect(await workspaceActions.renameSession('t1', '新名字')).toBe(false);
    expect(store.getState().notices.map((n) => n.text)).toEqual([copy.sidebar.renameFailed]);
  });

  test('copyText 失败报 copyFailed（剪贴板不可写如实报）', async () => {
    // 剪贴板桩钉死为拒写（全量合跑时他处的剪贴板桩会让本路走真成功——顺序不稳）
    const prior = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (): Promise<void> => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    try {
      expect(await workspaceActions.copyText('要复制的文本')).toBe(false);
      expect(store.getState().notices.map((n) => n.text)).toEqual([copy.thread.copyFailed]);
    } finally {
      if (prior === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
      else Object.defineProperty(navigator, 'clipboard', prior);
    }
  });

  test('steerSubagent 失败：按原因文案提示', async () => {
    store.setState({ activeThreadId: 't1', threads: { t1: { ...initialThreadState } } });
    jest.spyOn(controller, 'steerSubagent').mockResolvedValue('agent_busy');
    workspaceActions.steerSubagent('a1', '改做别的');
    await flush();
    expect(store.getState().notices.map((n) => n.text)).toEqual([copy.flow.steerFailed('agent_busy')]);
  });

  test('retryHydration：以活跃线程 force 越过 hydrated 守卫；无活跃线程零动作', () => {
    store.setState({ activeThreadId: 't1', threads: { t1: { ...initialThreadState } } });
    const ensure = jest.spyOn(controller, 'ensureHydrated').mockResolvedValue(undefined);
    workspaceActions.retryHydration();
    expect(ensure).toHaveBeenCalledWith('t1', { force: true });

    store.getState().reset();
    workspaceActions.retryHydration();
    expect(ensure).toHaveBeenCalledTimes(1);
  });
});
