import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { controller, store, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { initialThreadState } from '@/live/live-thread-state';
import { copy } from '@/strings';

/** workspace-actions 覆盖门缺口件（T43 拆分后大批透传面无直接断言）：
 *  会话生命周期透传、selectModel 项目记忆（50 上限淘汰）、默认模型/通知面。
 *  行为面由 controller 单测承担，此处断言透传寻址与 store 副作用。 */

beforeEach(() => {
  store.getState().reset();
  uiStore.getState().reset();
});

afterEach(() => {
  store.getState().reset();
  uiStore.getState().reset();
  jest.restoreAllMocks();
});

describe('会话生命周期透传', () => {
  test('createSession：controller.createSession 失败 → 通知 reason、返回 false', async () => {
    const spy = jest.spyOn(controller, 'createSession').mockResolvedValue({ ok: false, reason: 'boom' });
    const outcome = await workspaceActions.createSession({ cwd: '/tmp' });
    expect(outcome).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/tmp' }));
    expect(store.getState().notices.map((n) => n.text)).toEqual(['boom']);
  });

  test('createSession：成功返回 true；隐藏项目解除（updatePreferences 派发）', async () => {
    jest.spyOn(controller, 'createSession').mockResolvedValue({ ok: true, threadId: 't1' });
    const update = jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    store.setState({ preferences: { ...store.getState().preferences, hiddenProjects: ['/tmp'] } });
    const outcome = await workspaceActions.createSession({ cwd: '/tmp' });
    expect(outcome).toBe(true);
    expect(update).toHaveBeenCalledWith({ hiddenProjects: [] });
  });

  test('startTask：创建成功后投递首条消息；sendFailed 标志投递结果', async () => {
    jest.spyOn(controller, 'createSession').mockResolvedValue({ ok: true, threadId: 't9' });
    const submit = jest.spyOn(controller, 'submitDraft').mockResolvedValue(null);
    const ok = await workspaceActions.startTask({ cwd: '/tmp', text: 'hello' });
    expect(ok).toEqual({ ok: true, threadId: 't9', sendFailed: false });
    expect(submit).toHaveBeenCalledWith('t9', 'hello', undefined);

    submit.mockResolvedValue('no_active_session');
    const failed = await workspaceActions.startTask({ cwd: '/tmp', text: 'again' });
    expect(failed).toEqual({ ok: true, threadId: 't9', sendFailed: true });
  });

  test('closeSession / selectSession / stopActiveTurn 透传', () => {
    const close = jest.spyOn(controller, 'closeSession').mockReturnValue(undefined);
    workspaceActions.closeSession('t1');
    expect(close).toHaveBeenCalledWith('t1');

    const select = jest.spyOn(controller, 'selectSession').mockReturnValue(undefined);
    workspaceActions.selectSession('t2');
    expect(select).toHaveBeenCalledWith('t2');
  });
});

describe('selectModel：项目默认模型记忆', () => {
  test('选中在场模型 → controller.selectModel + projectModels 记忆', async () => {
    store.setState({
      activeThreadId: 't1',
      threads: { t1: { ...initialThreadState } },
      sessions: { t1: { threadId: 't1', cwd: '/proj', state: 'live' } as never },
      models: [{ provider: 'p', modelId: 'm1', label: 'M1' } as never],
    });
    const select = jest.spyOn(controller, 'selectModel').mockResolvedValue(true);
    const update = jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    workspaceActions.selectModel('p/m1');
    expect(select).toHaveBeenCalledWith('t1', 'p', 'm1');
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ projectModels: { '/proj': 'p/m1' } });
  });

  test('未知模型键：零副作用', () => {
    const select = jest.spyOn(controller, 'selectModel');
    workspaceActions.selectModel('nope/nope');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('通知与偏好面', () => {
  test('setDefaultModel：updatePreferences 失败 → preferenceSaveFailed 通知', async () => {
    jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    workspaceActions.setDefaultModel('p/m');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().notices.map((n) => n.text).length).toBeGreaterThan(0);
  });

  test('respondDialog / cancelDialog / dismissNotice / refresh* 透传', () => {
    const respond = jest.spyOn(controller, 'respondDialog').mockReturnValue(undefined);
    workspaceActions.respondDialog('r1', {});
    expect(respond).toHaveBeenCalledWith('r1', {});
    const cancel = jest.spyOn(controller, 'cancelDialog').mockReturnValue(undefined);
    workspaceActions.cancelDialog('r1');
    expect(cancel).toHaveBeenCalledWith('r1');
    const refreshSaved = jest.spyOn(controller, 'refreshSaved').mockReturnValue(undefined);
    workspaceActions.refreshSaved();
    expect(refreshSaved).toHaveBeenCalled();
    const refreshModels = jest.spyOn(controller, 'refreshModels').mockReturnValue(undefined);
    workspaceActions.refreshModels();
    expect(refreshModels).toHaveBeenCalled();
  });
});

describe('hub 设置与运行时面（透传与失败通知）', () => {
  test('refreshHubSettings / saveHubDefaults：写失败 → permissionSaveFailed + false', async () => {
    const read = jest.spyOn(controller, 'readHubSettings').mockReturnValue(undefined);
    workspaceActions.refreshHubSettings();
    expect(read).toHaveBeenCalled();

    jest.spyOn(controller, 'writeHubSettings').mockResolvedValue('io down');
    const ok = await workspaceActions.saveHubDefaults({ thinkingDefault: 'low' });
    expect(ok).toBe(false);
    expect(store.getState().notices.length).toBeGreaterThan(0);
  });

  test('saveHubDefaults 成功 → true 无通知', async () => {
    jest.spyOn(controller, 'writeHubSettings').mockResolvedValue(null);
    expect(await workspaceActions.saveHubDefaults(null)).toBe(true);
    expect(store.getState().notices).toEqual([]);
  });

  test('setSessionPermissionMode：空舞台守卫 false；成功链回读', async () => {
    // 无活跃线程 → false 不触 controller
    const set = jest.spyOn(controller, 'setSessionPermissionMode').mockResolvedValue(null);
    expect(await workspaceActions.setSessionPermissionMode('ask')).toBe(false);
    expect(set).not.toHaveBeenCalled();

    const read = jest.spyOn(controller, 'readSessionPermissionMode').mockReturnValue(undefined);
    store.setState({ activeThreadId: 't1' });
    expect(await workspaceActions.setSessionPermissionMode('ask')).toBe(true);
    expect(set).toHaveBeenCalledWith('t1', 'ask');
    expect(read).toHaveBeenCalledWith('t1');
  });

  test('saveGeneralPreferences：失败通知 + false；restartHost/stopThread/fetchRuntime 透传', async () => {
    jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    expect(await workspaceActions.saveGeneralPreferences({ localeSetting: 'zh' })).toBe(false);
    expect(store.getState().notices.length).toBeGreaterThan(0);

    const restart = jest.spyOn(controller, 'restartHost').mockReturnValue(undefined);
    workspaceActions.restartHost();
    expect(restart).toHaveBeenCalled();

    const stop = jest.spyOn(controller, 'stopActiveTurn').mockReturnValue(undefined);
    workspaceActions.stopThread('t3');
    expect(stop).toHaveBeenCalledWith('t3');
  });

  test('showNotice：直通 store；retireSession 失败 → recycleFailed', async () => {
    workspaceActions.showNotice('直通');
    expect(store.getState().notices.map((n) => n.text)).toEqual(['直通']);
    jest.spyOn(controller.runtime, 'retireSession').mockResolvedValue('busy');
    await workspaceActions.retireSession('t1');
    expect(store.getState().notices.map((n) => n.text)).toContain(copy.runtime.recycleFailed);
  });
});

describe('项目与会话整理动作', () => {
  test('removeProject：去重守卫', () => {
    const update = jest.spyOn(controller, 'updatePreferences').mockResolvedValue(null);
    store.setState({ preferences: { ...store.getState().preferences, hiddenProjects: ['/a'] } });
    workspaceActions.removeProject('/a'); // 已在场 → 零派发
    expect(update).not.toHaveBeenCalled();
    workspaceActions.removeProject('/b');
    expect(update).toHaveBeenCalledWith({ hiddenProjects: ['/a', '/b'] });
  });

  test('archiveSession：先落偏好再关会话；unarchive 移除记录', async () => {
    const update = jest.spyOn(controller, 'updatePreferences').mockResolvedValue({} as never);
    const close = jest.spyOn(controller, 'closeSession').mockReturnValue(undefined);
    store.setState({ sessions: { t1: { threadId: 't1', sessionPath: '/s/1.jsonl', state: 'live' } as never } });
    workspaceActions.archiveSession('t1');
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ archivedSessions: ['/s/1.jsonl'] });
    expect(close).toHaveBeenCalledWith('t1');

    store.setState({ preferences: { ...store.getState().preferences, archivedSessions: ['/s/1.jsonl'] } });
    workspaceActions.unarchiveSession('/s/1.jsonl');
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ archivedSessions: [] });
  });

  test('togglePinnedSession：切换置顶集合', async () => {
    const update = jest.spyOn(controller, 'updatePreferences').mockResolvedValue({} as never);
    workspaceActions.togglePinnedSession('/s/1.jsonl');
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ pinnedSessions: ['/s/1.jsonl'] });
    store.setState({ preferences: { ...store.getState().preferences, pinnedSessions: ['/s/1.jsonl'] } });
    workspaceActions.togglePinnedSession('/s/1.jsonl');
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith({ pinnedSessions: [] });
  });

  test('provider 与 git 动作透传', async () => {
    const upsert = jest.spyOn(controller, 'upsertProvider').mockResolvedValue(null);
    workspaceActions.upsertProvider({} as never);
    expect(upsert).toHaveBeenCalled();
    const remove = jest.spyOn(controller, 'removeProvider').mockResolvedValue(null);
    workspaceActions.removeProvider('p');
    expect(remove).toHaveBeenCalledWith('p');
    const branches = jest.spyOn(controller, 'listGitBranches').mockResolvedValue({ ok: true, data: [] } as never);
    await workspaceActions.listGitBranches('/tmp');
    expect(branches).toHaveBeenCalledWith('/tmp');
    const checkout = jest.spyOn(controller, 'checkoutGitBranch').mockResolvedValue({ ok: true, data: null } as never);
    await workspaceActions.checkoutGitBranch('/tmp', 'main', false);
    expect(checkout).toHaveBeenCalledWith('/tmp', 'main', false);
  });
});
