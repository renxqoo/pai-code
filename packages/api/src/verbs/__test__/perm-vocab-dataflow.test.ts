import { describe, expect, test } from 'bun:test';

import { PERM_MODES, type ApiError, type PermissionModeData } from '@paiapp/contracts';

import { sessionRoutes } from '../session';
import { createSettingsRoutes } from '../settings';

/** 权限模式词表数据流（词表只随读口响应的 modes 字段流动，不落模块状态）。
 *  症状回归背景：词表曾收敛在主进程模块变量，渲染进程读自己的模块实例——
 *  「UI 选项面 = host 词表」跨进程落空，选项面永远显示内置档。 */

type GetModeResult = { ok: true; data: PermissionModeData } | { ok: false; error: ApiError } | PromiseLike<never>;

function sessionRoutesWith(getMode: (input: { threadId?: string }) => PromiseLike<GetModeResult>) {
  return sessionRoutes({
    sessionCommands: () => {
      throw new Error('not needed');
    },
    threadCommands: () => {
      throw new Error('not needed');
    },
    modelCommands: () => {
      throw new Error('not needed');
    },
    permissionCommands: () => ({
      getMode: getMode as never,
      setMode: () => Promise.resolve({ ok: true as const, data: {} }),
    }),
    fail: (error: ApiError) => ({ ok: false as const, error }),
    runtime: {} as never,
    audit: () => undefined,
    savedAcrossCwds: () => Promise.resolve([] as never),
    channelModels: (models) => models,
    insideSessionsRoot: () => true,
    revealPath: () => undefined,
    fillSessionMeta: () => undefined,
  });
}

describe('permission/mode 词表透传（modes 随数据走）', () => {
  test('症状回归：host 扩档（modes 回传）原样透传——新档随响应到 UI，不靠本地模块状态', async () => {
    const hostVocab = [...PERM_MODES, 'future-mode'];
    const routes = sessionRoutesWith(() => Promise.resolve({ ok: true, data: { mode: 'edit-confirm', source: 'session', modes: hostVocab } }));
    const result = await routes['permission/mode']({ threadId: 't1' });
    expect(result).toEqual({ ok: true, data: { mode: 'edit-confirm', source: 'session', modes: hostVocab } });
  });

  test('老 host 缺席 modes → 回落内置缺省（选项面不塌）', async () => {
    const routes = sessionRoutesWith(() => Promise.resolve({ ok: true, data: { mode: 'auto', source: 'session' } }));
    const result = await routes['permission/mode']({ threadId: 't1' });
    expect(result).toEqual({ ok: true, data: { mode: 'auto', source: 'session', modes: [...PERM_MODES] } });
  });

  test('坏词表载荷（空数组/空词条/非数组）回落内置缺省（防坏响应清空选项面）', async () => {
    for (const modes of [[], [''], ['plan', 1], 'plan'] as unknown[]) {
      const routes = sessionRoutesWith(() => Promise.resolve({ ok: true, data: { mode: 'auto', source: 'default', modes: modes as string[] } }));
      const result = await routes['permission/mode']({ threadId: 't1' });
      expect(result).toEqual({ ok: true, data: { mode: 'auto', source: 'default', modes: [...PERM_MODES] } });
    }
  });
});

function settingsRoutesWith(options: {
  storedMode: unknown;
  getMode: (input: { threadId?: string }) => PromiseLike<GetModeResult>;
}) {
  return createSettingsRoutes({
    settings: {
      listProviders: () => [],
      upsertProvider: () => ({ ok: true as const, data: [] }),
      removeProvider: () => ({ ok: true as const, data: [] }),
      get: () => ({}) as never,
      patch: () => ({ ok: true as const, data: {} }),
    } as never,
    keyStore: { getKey: () => null } as never,
    restartHost: () => Promise.resolve(undefined),
    settingsCommands: () =>
      ({
        get: () => Promise.resolve({ ok: true as const, data: { values: { 'permission.defaultMode': options.storedMode } } }),
      }) as never,
    permissionCommands: () => ({ getMode: options.getMode as never, setMode: () => Promise.resolve({ ok: true as const, data: {} }) }),
  });
}

describe('app/hubSettings 词表读口（无 threadId 的权限双域全局档）', () => {
  test('词表来自全局 permission/get_mode（命令不带 threadId）并随响应到设置页', async () => {
    const seen: Array<{ threadId?: string }> = [];
    const hostVocab = [...PERM_MODES, 'future-mode'];
    const routes = settingsRoutesWith({
      storedMode: 'edit-confirm',
      getMode: (input) => {
        seen.push(input);
        return Promise.resolve({ ok: true, data: { mode: 'auto', source: 'default', modes: hostVocab } });
      },
    });
    const result = await routes.routes['app/hubSettings']({});
    expect(result).toEqual({ ok: true, data: { permissionDefaultMode: 'edit-confirm', thinkingDefault: null, permissionModes: hostVocab } });
    expect(seen).toEqual([{}]);
  });

  test('症状回归：词表读失败回落内置缺省——设置读不因词表整体失败', async () => {
    const routes = settingsRoutesWith({
      storedMode: 'full',
      getMode: () => Promise.resolve({ ok: false, error: { kind: 'host_unavailable' } as ApiError }),
    });
    const result = await routes.routes['app/hubSettings']({});
    expect(result).toEqual({ ok: true, data: { permissionDefaultMode: 'full', thinkingDefault: null, permissionModes: [...PERM_MODES] } });
  });

  test('读盘归一：旧档映射、词表内透传、词表外视为未设置', async () => {
    for (const [stored, expected] of [
      ['fullAuto', 'full'],
      ['acceptEdits', 'auto'],
      ['plan', 'plan'],
      ['future-mode', null],
      ['yolo', null],
    ] as const) {
      const routes = settingsRoutesWith({ storedMode: stored, getMode: () => Promise.resolve({ ok: true, data: { mode: 'auto', source: 'default', modes: [...PERM_MODES] } }) });
      const result = await routes.routes['app/hubSettings']({});
      expect(result).toEqual({ ok: true, data: { permissionDefaultMode: expected, thinkingDefault: null, permissionModes: [...PERM_MODES] } });
    }
  });
});
