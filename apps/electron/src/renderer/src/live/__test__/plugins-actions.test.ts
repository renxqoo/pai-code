import { describe, expect, test } from 'bun:test';
import type { ApiClient } from '@paiapp/api/client';

import { createPluginsActions } from '../plugins-actions';
import type { PluginsActions } from '../plugins-actions';
import type { LiveStore } from '../store';

/** 插件动作组（plugin-runtime M4 拆分件——交付时无直接单测，覆盖门缺口件）：
 *  清单/启停（热装热卸分叉 + 失败降级重开）/候选/批量导入（逐条隔离）/移除/
 *  agent 提案三方法（list/confirm/reject）。热生效分叉与技能面「恒重开」刻意不同。 */

interface PluginStubState {
  list?: unknown;
  setEnabled?: unknown;
  candidates?: unknown;
  imports?: Record<string, unknown>;
  removes?: unknown;
  proposals?: unknown;
  confirmProposal?: unknown;
  rejectProposal?: unknown;
  hotInstall?: unknown;
  hotUninstall?: unknown;
}

function harness(stub: PluginStubState, sessions: Array<{ threadId: string; state: string }> = []) {
  const patches: unknown[] = [];
  const calls: string[] = [];
  const api = {
    plugins: {
      list: () => Promise.resolve(stub.list ?? { ok: true, data: [] }),
      setEnabled: (input: { name: string; enabled: boolean }) => {
        calls.push(`setEnabled:${input.name}:${input.enabled ? 'on' : 'off'}`);
        return Promise.resolve(stub.setEnabled);
      },
      candidates: () => Promise.resolve(stub.candidates),
      import: (input: { sourcePath: string }) => {
        calls.push(`import:${input.sourcePath}`);
        return Promise.resolve(stub.imports?.[input.sourcePath] ?? { ok: true, data: null });
      },
      remove: () => Promise.resolve(stub.removes),
      proposals: () => Promise.resolve(stub.proposals),
      confirmProposal: (input: { proposalId: string }) => {
        calls.push(`confirm:${input.proposalId}`);
        return Promise.resolve(stub.confirmProposal);
      },
      rejectProposal: (input: { proposalId: string }) => {
        calls.push(`reject:${input.proposalId}`);
        return Promise.resolve(stub.rejectProposal);
      },
      hotInstall: (input: { threadId: string; name: string }) => {
        calls.push(`hotInstall:${input.threadId}:${input.name}`);
        return Promise.resolve(stub.hotInstall ?? { ok: true });
      },
      hotUninstall: (input: { threadId: string; name: string }) => {
        calls.push(`hotUninstall:${input.threadId}:${input.name}`);
        return Promise.resolve(stub.hotUninstall ?? { ok: true });
      },
    },
  } as unknown as ApiClient;
  const store = {
    setState: (patch: unknown) => patches.push(patch),
    getState: () => ({ sessions }),
  } as unknown as LiveStore;
  const actions: PluginsActions = createPluginsActions({
    api,
    store,
    chainSkills: (run) => run(),
    reopenSession: (threadId: string) => {
      calls.push(`reopen:${threadId}`);
      return Promise.resolve(threadId !== 'dead-live');
    },
  });
  return { actions, patches, calls };
}

const PLUGINS = [{ name: 'p1', enabled: true, source: 'vendor' as const, version: '1.0.0', apiVersion: 1, capabilities: [] }];

describe('plugins-actions（插件动作组）', () => {
  test('refreshPlugins：清单落 store；失败不动 store', async () => {
    const okCase = harness({ list: { ok: true, data: PLUGINS } });
    await okCase.actions.refreshPlugins();
    expect(okCase.patches).toEqual([{ plugins: PLUGINS }]);
    const failCase = harness({ list: { ok: false, error: { kind: 'io_failed', message: 'x' } } });
    await failCase.actions.refreshPlugins();
    expect(failCase.patches).toEqual([]);
  });

  test('applyPluginToggle：enable 走热装、disable 走热卸；失败降级重开', async () => {
    const on = harness({ setEnabled: { ok: true, data: PLUGINS }, hotInstall: { ok: true } }, [
      { threadId: 'live-1', state: 'live' },
      { threadId: 'parked', state: 'parked' },
    ]);
    const onOutcome = await on.actions.applyPluginToggle('p1', true);
    expect(onOutcome).toEqual({ ok: true, hotFailures: 0 });
    expect(on.calls).toEqual(['setEnabled:p1:on', 'hotInstall:live-1:p1']); // parked 会话不热装

    const off = harness({ setEnabled: { ok: true, data: PLUGINS }, hotUninstall: { ok: true } }, [
      { threadId: 'live-1', state: 'live' },
    ]);
    await off.actions.applyPluginToggle('p1', false);
    expect(off.calls).toEqual(['setEnabled:p1:off', 'hotUninstall:live-1:p1']);
  });

  test('applyPluginToggle：热装失败 → 重开；重开也失败 → hotFailures 计数', async () => {
    const h = harness(
      { setEnabled: { ok: true, data: PLUGINS }, hotInstall: { ok: false, error: { kind: 'internal', message: 'x' } } },
      [
        { threadId: 'live-1', state: 'live' },
        { threadId: 'dead-live', state: 'live' },
      ],
    );
    const outcome = await h.actions.applyPluginToggle('p1', true);
    expect(outcome).toEqual({ ok: true, hotFailures: 1 }); // live-1 重开成功、dead-live 重开失败
    expect(h.calls).toEqual([
      'setEnabled:p1:on',
      'hotInstall:live-1:p1',
      'reopen:live-1',
      'hotInstall:dead-live:p1',
      'reopen:dead-live',
    ]);
  });

  test('setPluginEnabled 失败：reason 透传、不触热装', async () => {
    const h = harness({ setEnabled: { ok: false, error: { kind: 'state_conflict', message: 'nope' } } }, [
      { threadId: 'live-1', state: 'live' },
    ]);
    const outcome = await h.actions.applyPluginToggle('p1', true);
    expect(outcome).toEqual({ ok: false, reason: expect.any(String) }); // copyOfError 固定文案（按 kind 映射）
    expect(h.calls).toEqual(['setEnabled:p1:on']);
  });

  test('scanPluginCandidates：成功收窄；失败 reason 化', async () => {
    const okCase = harness({ candidates: { ok: true, data: { candidates: [{ name: 'c1' }] } } });
    const ok = await okCase.actions.scanPluginCandidates();
    expect(ok).toEqual({ ok: true, candidates: [{ name: 'c1' }] });
    const failCase = harness({ candidates: { ok: false, error: { kind: 'io_failed', message: 'bad' } } });
    const fail = await failCase.actions.scanPluginCandidates();
    expect(fail.ok).toBe(false);
  });

  test('importPlugins：逐条隔离（失败不中断）+ 每条成功后热装 + 清单回读', async () => {
    const h = harness(
      {
        imports: {
          '/tmp/good': { ok: true, data: { plugins: PLUGINS, imported: { name: 'p1' } } },
          '/tmp/bad': { ok: false, error: { kind: 'plugin_install_failed', message: 'bad zip' } },
        },
      },
      [{ threadId: 'live-1', state: 'live' }],
    );
    const summary = await h.actions.importPlugins([
      { sourcePath: '/tmp/good', overwrite: false },
      { sourcePath: '/tmp/bad', overwrite: false },
    ]);
    expect(summary.imported).toBe(1);
    expect(summary.failed).toEqual([{ name: 'bad', reason: expect.any(String) }]);
    expect(summary.reopenFailures).toBe(0);
    expect(h.calls).toEqual(['import:/tmp/good', 'hotInstall:live-1:p1', 'import:/tmp/bad']);
    expect(h.patches).toEqual([{ plugins: PLUGINS }]);
  });

  test('importPlugins：label 取 sourcePath 末段', async () => {
    const h = harness({
      imports: {
        '/a/b/zip-plugin': { ok: false, error: { kind: 'plugin_install_failed', message: 'x' } },
      },
    });
    const summary = await h.actions.importPlugins([{ sourcePath: '/a/b/zip-plugin', overwrite: true }]);
    expect(summary.failed[0]?.name).toBe('zip-plugin');
  });

  test('removePlugin：清单回写 + 热卸', async () => {
    const h = harness({ removes: { ok: true, data: [] } }, [{ threadId: 'live-1', state: 'live' }]);
    const outcome = await h.actions.removePlugin('p1');
    expect(outcome).toEqual({ ok: true, hotFailures: 0 });
    expect(h.calls).toEqual(['hotUninstall:live-1:p1']);
    expect(h.patches).toEqual([{ plugins: [] }]);
  });

  test('removePlugin 失败：reason 透传', async () => {
    const h = harness({ removes: { ok: false, error: { kind: 'plugin_uninstall_failed', message: 'busy' } } });
    const outcome = await h.actions.removePlugin('p1');
    expect(outcome).toEqual({ ok: false, reason: expect.any(String) });
  });

  test('提案三方法：list 收窄 / confirm / reject 失败 reason 化', async () => {
    const list = harness({ proposals: { ok: true, data: { proposals: [{ proposalId: 'pr-1', name: 'pp' }] } } });
    const listed = await list.actions.listPluginProposals();
    expect(listed).toEqual({ ok: true, proposals: [{ proposalId: 'pr-1', name: 'pp' }] });
    const listFail = harness({ proposals: { ok: false, error: { kind: 'io_failed', message: 'down' } } });
    expect((await listFail.actions.listPluginProposals()).ok).toBe(false);

    const confirmOk = harness({ confirmProposal: { ok: true, data: { ok: true } } });
    expect(await confirmOk.actions.confirmPluginProposal('pr-1')).toEqual({ ok: true });
    const confirmFail = harness({ confirmProposal: { ok: false, error: { kind: 'plugin_install_failed', message: 'gone' } } });
    expect((await confirmFail.actions.confirmPluginProposal('pr-1')).ok).toBe(false);

    const rejectOk = harness({ rejectProposal: { ok: true, data: { ok: true } } });
    expect(await rejectOk.actions.rejectPluginProposal('pr-1')).toEqual({ ok: true });
    const rejectFail = harness({ rejectProposal: { ok: false, error: { kind: 'plugin_install_failed', message: 'gone' } } });
    expect((await rejectFail.actions.rejectPluginProposal('pr-1')).ok).toBe(false);
  });
});
