import { afterEach, describe, expect, jest, test } from 'bun:test';

import { controller } from '@/live/workspace-runtime';
import { copy } from '@/strings';

import { resourceActions } from '../resource-actions';

/** 设置页资源动作（插件族——plugin-runtime M4 拆分件，覆盖门缺口件）：
 *  透传 controller 插件动作组并包装失败 notice。热生效分叉：失败 notice 用
 *  pluginHotFailed/pluginToggleFailed，与技能族文案分开。 */

function harness() {
  const notices: string[] = [];
  const actions = resourceActions({
    controller,
    pushNotice: (message: string) => notices.push(message),
  });
  return { actions, notices };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('resourceActions（插件族）', () => {
  test('refreshPlugins：透传（void）', async () => {
    const spy = jest.spyOn(controller, 'refreshPlugins').mockResolvedValue();
    harness().actions.refreshPlugins();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  test('setPluginEnabled：成功无通知；hotFailures>0 通知热失败；动作失败通知 toggle 失败', async () => {
    const ok = harness();
    jest.spyOn(controller, 'applyPluginToggle').mockResolvedValue({ ok: true, hotFailures: 0 });
    expect(await ok.actions.setPluginEnabled('p1', true)).toBe(true);
    expect(ok.notices).toEqual([]);

    const hotFail = harness();
    jest.spyOn(controller, 'applyPluginToggle').mockResolvedValue({ ok: true, hotFailures: 2 });
    expect(await hotFail.actions.setPluginEnabled('p1', true)).toBe(true);
    expect(hotFail.notices).toEqual([copy.settings.pluginHotFailed]);

    const fail = harness();
    jest.spyOn(controller, 'applyPluginToggle').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await fail.actions.setPluginEnabled('p1', true)).toBe(false);
    expect(fail.notices).toEqual([copy.settings.pluginToggleFailed]);
  });

  test('scanPluginCandidates：成功收窄；失败 null + 通知', async () => {
    const ok = harness();
    jest.spyOn(controller, 'scanPluginCandidates').mockResolvedValue({ ok: true, candidates: [{ name: 'c' }] });
    expect(await ok.actions.scanPluginCandidates()).toEqual([{ name: 'c' }]);
    expect(ok.notices).toEqual([]);

    const fail = harness();
    jest.spyOn(controller, 'scanPluginCandidates').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await fail.actions.scanPluginCandidates()).toBe(null);
    expect(fail.notices).toEqual([copy.settings.skillScanFailed]);
  });

  test('importPlugins：reopenFailures>0 通知；汇总透传', async () => {
    const summary = { imported: 1, failed: [], reopenFailures: 1 };
    const h = harness();
    jest.spyOn(controller, 'importPlugins').mockResolvedValue(summary);
    expect(await h.actions.importPlugins([])).toEqual(summary);
    expect(h.notices).toEqual([copy.settings.pluginHotFailed]);
  });

  test('removePlugin：成功无通知；hotFailures 通知；失败通知删除失败', async () => {
    const ok = harness();
    jest.spyOn(controller, 'removePlugin').mockResolvedValue({ ok: true, hotFailures: 0 });
    expect(await ok.actions.removePlugin('p1')).toBe(true);
    expect(ok.notices).toEqual([]);

    const hot = harness();
    jest.spyOn(controller, 'removePlugin').mockResolvedValue({ ok: true, hotFailures: 1 });
    expect(await hot.actions.removePlugin('p1')).toBe(true);
    expect(hot.notices).toEqual([copy.settings.pluginHotFailed]);

    const fail = harness();
    jest.spyOn(controller, 'removePlugin').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await fail.actions.removePlugin('p1')).toBe(false);
    expect(fail.notices).toEqual([copy.settings.skillDeleteFailed]);
  });

  test('提案三方法：list 失败 null；confirm/reject 失败通知 + false', async () => {
    const list = harness();
    jest.spyOn(controller, 'listPluginProposals').mockResolvedValue({
      ok: true,
      proposals: [{ proposalId: 'pr-1', name: 'pp', sourcePath: '/s', capabilities: ['fs'], contentHash: 'h' }],
    });
    expect((await list.actions.listPluginProposals())?.length).toBe(1);

    const listFail = harness();
    jest.spyOn(controller, 'listPluginProposals').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await listFail.actions.listPluginProposals()).toBe(null);

    const confirmFail = harness();
    jest.spyOn(controller, 'confirmPluginProposal').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await confirmFail.actions.confirmPluginProposal('pr-1')).toBe(false);
    expect(confirmFail.notices).toEqual([copy.settings.pluginToggleFailed]);

    const rejectFail = harness();
    jest.spyOn(controller, 'rejectPluginProposal').mockResolvedValue({ ok: false, reason: 'x' });
    expect(await rejectFail.actions.rejectPluginProposal('pr-1')).toBe(false);
    expect(rejectFail.notices).toEqual([copy.settings.pluginToggleFailed]);

    const confirmOk = harness();
    jest.spyOn(controller, 'confirmPluginProposal').mockResolvedValue({ ok: true });
    expect(await confirmOk.actions.confirmPluginProposal('pr-1')).toBe(true);
    expect(confirmOk.notices).toEqual([]);
  });
});
