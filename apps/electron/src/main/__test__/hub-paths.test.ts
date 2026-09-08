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

describe('hub-paths 解析链（设置 > env > dev 同级探测 > 打包产物）', () => {
  test('症状回归：无 env 无 settings 时探测同级 pi 检出，dist 优先于 src', () => {
    const [dist, src] = devHubEntryCandidates('/work/agent-app');
    expect(dist).toBe('/work/pi/app/dist/cli.js');
    expect(src).toBe('/work/pi/app/src/cli.ts');
    const resolved = resolveHubPaths({
      fromSettings: null,
      fromEnv: null,
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(dist, src),
    });
    expect(resolved).toEqual({ bunPath: 'bun', hubEntry: dist });
  });

  test('同级检出未构建（只有源码）时回落 src/cli.ts', () => {
    const [, src] = devHubEntryCandidates('/work/agent-app');
    const resolved = resolveHubPaths({
      fromSettings: null,
      fromEnv: null,
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(src),
    });
    expect(resolved).toEqual({ bunPath: 'bun', hubEntry: src });
  });

  test('设置覆盖与 env 均优先于探测', () => {
    const [dist] = devHubEntryCandidates('/work/agent-app');
    const deps = {
      fromEnv: { bunPath: 'bun', hubEntry: '/env/cli.ts' },
      fromPackaged: null,
      devRepoRoot: '/work/agent-app',
      packaged: false,
      exists: withFiles(dist),
    };
    expect(
      resolveHubPaths({ ...deps, fromSettings: { bunPath: '/custom/bun', hubEntry: '/settings/cli.js' } }),
    ).toEqual({ bunPath: '/custom/bun', hubEntry: '/settings/cli.js' });
    expect(resolveHubPaths({ ...deps, fromSettings: null })).toEqual({ bunPath: 'bun', hubEntry: '/env/cli.ts' });
  });

  test('打包态跳过探测（内嵌产物缺省）；devRepoRoot null 同样不探测', () => {
    const [dist] = devHubEntryCandidates('/work/agent-app');
    const packaged = { bunPath: '/res/bun/bun', hubEntry: '/res/pai-cli/cli.js' };
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: packaged, devRepoRoot: '/work/agent-app', packaged: true, exists: withFiles(dist) }),
    ).toEqual(packaged);
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: packaged, devRepoRoot: null, packaged: false, exists: withFiles(dist) }),
    ).toEqual(packaged);
  });

  test('全部缺失 → null（上层须呈现「宿主未连接」而非「没有模型」）', () => {
    expect(
      resolveHubPaths({ fromSettings: null, fromEnv: null, fromPackaged: null, devRepoRoot: '/work/agent-app', packaged: false, exists: () => false }),
    ).toBeNull();
  });
});
