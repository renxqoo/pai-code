/**
 * 插件域 verbs 测试（plugin-runtime §M3）：错误映射矩阵、候选合并三态、
 * 源面白名单门（realpath 越界拒）、导入闭环（hub install → 回读断言 → 热装编排）、
 * 应答形状收窄（坏形状 malformed 不静默）。
 */
import { describe, expect, test } from 'bun:test';

import type { ApiError } from '@paiapp/contracts';
import { mapPluginError, pluginRowsOf, createPluginRoutes } from '../plugins';
import { failClosedPluginSources } from '../plugin-source';
import type { SettingsCommands } from '../../commands/settings';

describe('mapPluginError：hub 错误 → app kind 矩阵', () => {
  const fallback = (error: ApiError): ApiError => error;
  const cases: Array<[ApiError, string]> = [
    [{ kind: 'invalid_input', message: 'invalid plugin source' }, 'plugin_source_invalid'],
    [{ kind: 'name_conflict', message: 'plugin already installed' }, 'plugin_exists'],
    [{ kind: 'state_conflict', message: 'builtin plugin is not removable: x' }, 'plugin_builtin_immutable'],
    [{ kind: 'state_conflict', message: 'unknown plugin: x' }, 'plugin_source_invalid'],
    [{ kind: 'plugin_install_failed', message: 'apply failed' }, 'plugin_install_failed'],
    [{ kind: 'plugin_uninstall_failed', message: 'has dependents' }, 'plugin_uninstall_failed'],
    [{ kind: 'io_failed', message: 'ENOENT' }, 'plugin_source_invalid'],
    [{ kind: 'internal', message: 'boom' }, 'internal'],
  ];
  for (const [error, expected] of cases) {
    test(`${error.kind} → ${expected}`, () => {
      const mapped = mapPluginError(error, fallback);
      expect(mapped.kind).toBe(expected);
    });
  }
});

describe('pluginRowsOf：应答形状收窄', () => {
  test('合法行全字段；坏行（缺名/坏 source）丢弃；非数组 → undefined（malformed）', () => {
    const rows = pluginRowsOf({
      plugins: [
        { name: 'a', source: 'builtin', origin: null, version: null, enabled: true, status: 'active', disabledReason: null, description: null, path: null },
        { name: 'b', source: 'vendor', origin: 'agent', version: 1, enabled: false, status: 'disabled', disabledReason: 'apiVersion 9 does not match kernel 1', description: 'x', path: 'b' },
        { name: '', source: 'builtin', enabled: true, status: 'active' },
        { name: 'c', source: 'weird', enabled: true, status: 'active' },
        'garbage',
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({ name: 'a', source: 'builtin', origin: null });
    expect(rows?.[1]).toMatchObject({ name: 'b', origin: 'agent', version: 1, status: 'disabled' });
    expect(pluginRowsOf({})).toBeUndefined();
    expect(pluginRowsOf(undefined)).toBeUndefined();
  });
});

/** hub 命令面替身（按调用序列编程）。 */
function fakeSettingsCommands(behavior: {
  list?: unknown;
  inspect?: unknown;
  install?: unknown;
  hotInstall?: unknown;
  proposals?: unknown;
  confirmProposal?: unknown;
  rejectProposal?: unknown;
  errors?: Array<{ kind: string; message: string }>;
}): SettingsCommands {
  let callIndex = 0;
  const err = (i: number): ApiError | undefined => {
    const entry = behavior.errors?.[i];
    return entry === undefined ? undefined : ({ kind: entry.kind, message: entry.message } as ApiError);
  };
  return {
    get: () => Promise.resolve({ ok: true, data: {} }),
    set: () => Promise.resolve({ ok: true, data: {} }),
    inspectSkills: () => Promise.resolve({ ok: true, data: {} }),
    listSkills: () => Promise.resolve({ ok: true, data: {} }),
    installSkill: () => Promise.resolve({ ok: true, data: {} }),
    setSkillEnabled: () => Promise.resolve({ ok: true, data: {} }),
    removeSkill: () => Promise.resolve({ ok: true, data: {} }),
    setIdleRetireMs: () => Promise.resolve({ ok: true, data: {} }),
    listPlugins: () => {
      const error = err(callIndex);
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.list }) : Promise.resolve({ ok: false, error });
    },
    inspectPlugins: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.inspect }) : Promise.resolve({ ok: false, error });
    },
    installPlugin: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.install }) : Promise.resolve({ ok: false, error });
    },
    uninstallPlugin: () => Promise.resolve({ ok: true, data: {} }),
    setPluginEnabled: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: {} }) : Promise.resolve({ ok: false, error });
    },
    removePlugin: () => Promise.resolve({ ok: true, data: {} }),
    hotInstallPlugin: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.hotInstall ?? { name: 'p', mode: 'worker' } }) : Promise.resolve({ ok: false, error });
    },
    hotUninstallPlugin: () => Promise.resolve({ ok: true, data: {} }),
    listPluginProposals: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.proposals }) : Promise.resolve({ ok: false, error });
    },
    confirmPluginProposal: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.confirmProposal ?? {} }) : Promise.resolve({ ok: false, error });
    },
    rejectPluginProposal: () => {
      const error = err(callIndex);
      callIndex += 1;
      return error === undefined ? Promise.resolve({ ok: true, data: behavior.rejectProposal ?? {} }) : Promise.resolve({ ok: false, error });
    },
  };
}

const goodList = {
  plugins: [
    { name: 'p', source: 'vendor', origin: 'manual', version: 1, enabled: true, status: 'active', disabledReason: null, description: null, path: 'p' },
  ],
};

describe('createPluginRoutes：导入闭环与热装编排', () => {
  test('import：gate → inspect ready → hub install → 热装转发 → 回读断言落位', async () => {
    const hotTargets: string[] = [];
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({
        inspect: { results: [{ sourcePath: '/approved/p', state: 'ready', manifest: { name: 'p', apiVersion: 1 } }] },
        install: { plugin: { name: 'p', path: '/vendor/p', sha256: 'abc', skippedEntries: 0 } },
        list: goodList,
      }),
      sources: {
        discover: () => Promise.resolve({ ok: true as const, found: [{ sourcePath: '/approved/p', origin: 'picked' as const }] }),
        gate: () => Promise.resolve({ ok: true as const, origin: 'picked' as const }),
      },
      hotInstallTargets: () => { hotTargets.push('t1'); return ['t1']; },
    });
    const outcome = await routes.routes['plugins/import']({ sourcePath: '/approved/p', overwrite: false });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.imported).toEqual({ name: 'p', sha256: 'abc' });
      expect(outcome.data.plugins).toHaveLength(1);
    }
    expect(hotTargets).toEqual(['t1']);
  });

  test('import：inspect blocked → plugin_source_invalid（不到 hub install）', async () => {
    let installCalled = false;
    const routes = createPluginRoutes({
      settingsCommands: () => ({
        ...fakeSettingsCommands({ inspect: { results: [{ sourcePath: '/approved/bad', state: 'blocked', problem: 'bare @x-harness/core import' }] } }),
        installPlugin: () => { installCalled = true; return Promise.resolve({ ok: true, data: {} }); },
      }),
      sources: { discover: () => Promise.resolve({ ok: true as const, found: [] }), gate: () => Promise.resolve({ ok: true as const, origin: 'picked' as const }) },
    });
    const outcome = await routes.routes['plugins/import']({ sourcePath: '/approved/bad', overwrite: false });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('plugin_source_invalid');
    expect(installCalled).toBe(false);
  });

  test('import：gate 拒（批准根外）→ 不进 hub', async () => {
    let inspectCalled = false;
    const routes = createPluginRoutes({
      settingsCommands: () => ({
        ...fakeSettingsCommands({}),
        inspectPlugins: () => { inspectCalled = true; return Promise.resolve({ ok: true, data: {} }); },
      }),
      sources: { discover: () => Promise.resolve({ ok: true as const, found: [] }), gate: () => Promise.resolve({ ok: false as const, error: { kind: 'plugin_source_invalid' as const, message: 'outside' } }) },
    });
    const outcome = await routes.routes['plugins/import']({ sourcePath: '/etc/passwd', overwrite: false });
    expect(outcome.ok).toBe(false);
    expect(inspectCalled).toBe(false);
  });

  test('import：写后回读断言（list 无该件 → plugin_source_invalid）', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({
        inspect: { results: [{ sourcePath: '/approved/p', state: 'ready', manifest: { name: 'ghost', apiVersion: 1 } }] },
        install: { plugin: { name: 'ghost', path: '/vendor/ghost', sha256: 'x', skippedEntries: 0 } },
        list: { plugins: [] },
      }),
      sources: { discover: () => Promise.resolve({ ok: true as const, found: [] }), gate: () => Promise.resolve({ ok: true as const, origin: 'picked' as const }) },
    });
    const outcome = await routes.routes['plugins/import']({ sourcePath: '/approved/p', overwrite: false });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('plugin_source_invalid');
  });

  test('list：hub 失败降级空表；host 未启动不炸', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({}),
      sources: failClosedPluginSources,
    });
    // fakeSettingsCommands.listPlugins 恒 ok+undefined data → 收窄 undefined → []
    expect(await routes.pluginsList()).toEqual([]);
  });

  test('candidates：discover 空 → 空候选（不调 hub inspect）', async () => {
    let inspectCalled = false;
    const routes = createPluginRoutes({
      settingsCommands: () => ({
        ...fakeSettingsCommands({}),
        inspectPlugins: () => { inspectCalled = true; return Promise.resolve({ ok: true, data: { results: [] } }); },
      }),
      sources: { discover: () => Promise.resolve({ ok: true as const, found: [] }), gate: () => Promise.resolve({ ok: true as const, origin: 'picked' as const }) },
    });
    const outcome = await routes.routes['plugins/candidates']({});
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.candidates).toEqual([]);
    expect(inspectCalled).toBe(false);
  });

  test('candidates：三态合并（ready/rename/blocked + origin 标签）', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({
        inspect: {
          results: [
            { sourcePath: '/r/a', state: 'ready', manifest: { name: 'a', apiVersion: 1, description: 'A' } },
            { sourcePath: '/r/b-dir', state: 'rename', manifest: { name: 'b', apiVersion: 1 } },
            { sourcePath: '/r/c', state: 'blocked', problem: 'no plugin.json' },
          ],
        },
      }),
      sources: {
        discover: () => Promise.resolve({ ok: true as const, found: [{ sourcePath: '/r/a', origin: 'picked' as const }, { sourcePath: '/r/b-dir', origin: 'picked' as const }, { sourcePath: '/r/c', origin: 'picked' as const }] }),
        gate: () => Promise.resolve({ ok: true as const, origin: 'picked' as const }),
      },
    });
    const outcome = await routes.routes['plugins/candidates']({});
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const states = outcome.data.candidates.map((c) => [c.name, c.state, c.problem]);
      expect(states).toEqual([
        ['a', 'ready', null],
        ['b', 'rename', 'name_mismatch'],
        ['c', 'blocked', 'no plugin.json'],
      ]);
    }
  });

  test('proposals：登记态直读（形状收窄）——坏行丢弃、缺字段丢行', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({
        proposals: {
          proposals: [
            {
              proposalId: 'pr-1', sourcePath: '/agent/src/p1', name: 'p1', description: 'd',
              requestedCapabilities: ['fs', 'net', 42], sha256: 'abc', createdAt: 1, confirmed: false,
            },
            { proposalId: 123 }, // 坏行：id 非字符串
            'garbage',
          ],
        },
      }),
      sources: failClosedPluginSources,
    });
    const outcome = await routes.routes['plugins/proposals']({});
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.proposals).toHaveLength(1);
      expect(outcome.data.proposals[0]).toMatchObject({ proposalId: 'pr-1', name: 'p1', sha256: 'abc' });
      expect(outcome.data.proposals[0].requestedCapabilities).toEqual(['fs', 'net']); // 非串项滤除
    }
  });

  test('proposals：应答缺 proposals 数组 → malformed_response（不静默空表）', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ proposals: { what: 'else' } }),
      sources: failClosedPluginSources,
    });
    const outcome = await routes.routes['plugins/proposals']({});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('malformed_response');
  });

  test('proposals：hub 失败 → mapPluginError 透出', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ errors: [{ kind: 'io_failed', message: 'host down' }] }),
      sources: failClosedPluginSources,
    });
    const outcome = await routes.routes['plugins/proposals']({});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('plugin_source_invalid');
  });

  test('confirmProposal / rejectProposal：透传 proposalId；hub 拒映射后透出', async () => {
    const confirmOk = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ confirmProposal: { ok: true } }),
      sources: failClosedPluginSources,
    });
    expect(await confirmOk.routes['plugins/confirmProposal']({ proposalId: 'pr-1' })).toEqual({ ok: true, data: null });

    const rejectOk = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ rejectProposal: { ok: true } }),
      sources: failClosedPluginSources,
    });
    expect(await rejectOk.routes['plugins/rejectProposal']({ proposalId: 'pr-1' })).toEqual({ ok: true, data: null });

    const rejectFail = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ errors: [{ kind: 'plugin_install_failed', message: 'gone' }] }),
      sources: failClosedPluginSources,
    });
    const outcome = await rejectFail.routes['plugins/rejectProposal']({ proposalId: 'pr-gone' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('plugin_install_failed');
  });

  test('hotInstall：hub 拒 → 映射后错误透出', async () => {
    const routes = createPluginRoutes({
      settingsCommands: () => fakeSettingsCommands({ errors: [{ kind: 'plugin_install_failed', message: 'worker boot timeout' }] }),
      sources: failClosedPluginSources,
    });
    const outcome = await routes.routes['plugins/hotInstall']({ threadId: 't1', name: 'p' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('plugin_install_failed');
  });
});

describe('failClosedPluginSources：未接线形态不放大能力面', () => {
  test('gate 恒拒；discover 恒空', async () => {
    const gate = await failClosedPluginSources.gate('/any');
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error.kind).toBe('plugin_source_invalid');
    const found = await failClosedPluginSources.discover();
    expect(found.ok && found.found).toEqual([]);
  });
});

