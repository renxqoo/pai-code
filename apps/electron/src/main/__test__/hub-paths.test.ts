import { describe, expect, test } from 'bun:test';

import { devHubEntryCandidates, resolveHubPaths } from '../hub-paths';

/**
 * 宿主路径解析链回归：dev shell 丢失 PAI_HUB_ENTRY 时曾直接判 hub_paths_unconfigured
 * （host 不启动 → 模型目录空 → composer 显示「还没有模型」，误导已配置 provider 的用户）。
 */

const withFiles =
  (...paths: string[]) =>
  (path: string): boolean =>
    new Set(paths).has(path);

/** devHubEntryCandidates 恒返回 [src, dist] 双候选（元组断言去 noUncheckedIndexedAccess 噪音）。 */
function candidatesOf(root: string): [string, string] {
  const [src, dist] = devHubEntryCandidates(root);
  if (src === undefined || dist === undefined) throw new Error('dev candidates malformed');
  return [src, dist];
}

describe('hub-paths 解析链（设置 > env > dev 同级探测 > 打包产物）', () => {
  test('症状回归：无 env 无 settings 时探测同级 my-agent 检出，src 优先于 dist', () => {
    const [src, dist] = candidatesOf('/work/agent-app');
    expect(src).toBe('/work/my-agent/packages/host-hub/src/host/cli.ts');
    expect(dist).toBe('/work/my-agent/packages/host-hub/dist/host/cli.js');
    const resolved = resolveHubPaths({
      fromSettings: null,
      fromEnv: null,
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(src, dist),
    });
    expect(resolved).toEqual({ bunPath: 'bun', hubEntry: src });
  });

  test('同级检出不完整（只有 dist 产物）时回落 dist/host/cli.js', () => {
    const [, dist] = candidatesOf('/work/agent-app');
    const resolved = resolveHubPaths({
      fromSettings: null,
      fromEnv: null,
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(dist),
    });
    expect(resolved).toEqual({ bunPath: 'bun', hubEntry: dist });
  });

  test('设置覆盖与 env 均优先于探测', () => {
    const [src] = candidatesOf('/work/agent-app');
    const deps = {
      fromEnv: { bunPath: 'bun', hubEntry: '/env/cli.ts' },
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(src),
    };
    expect(
      resolveHubPaths({ ...deps, fromSettings: { bunPath: '/custom/bun', hubEntry: '/settings/cli.js' } }),
    ).toEqual({ bunPath: '/custom/bun', hubEntry: '/settings/cli.js' });
    expect(resolveHubPaths({ ...deps, fromSettings: null })).toEqual({ bunPath: 'bun', hubEntry: '/env/cli.ts' });
  });

  test('打包态跳过探测（内嵌直执行产物缺省）；devRepoRoot null 同样不探测', () => {
    const [src] = candidatesOf('/work/agent-app');
    const packaged: { bunPath: string; hubEntry: string | null } = { bunPath: '/res/host-hub/host-hub', hubEntry: null };
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: packaged, devRepoRoot: '/work/agent-app', packaged: true, exists: withFiles(src) }),
    ).toEqual(packaged);
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: packaged, devRepoRoot: null, packaged: false, exists: withFiles(src) }),
    ).toEqual(packaged);
  });

  test('全部缺失 → null（上层须呈现「宿主未连接」而非「没有模型」）', () => {
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: null, devRepoRoot: '/work/agent-app', packaged: false, exists: () => false }),
    ).toBeNull();
  });
});
