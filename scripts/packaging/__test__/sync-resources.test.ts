import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { collectHarnessDeps, resolveResourceSources } from '../sync-resources';

/** 资源来源解析回归：env 覆盖优先、缺省走旁级 x-harness 检出源码入口（编译输入）。 */

test('env 覆盖优先于缺省来源', () => {
  const sources = resolveResourceSources(
    { PAI_BUN_PATH: '/custom/bun', PAI_HUB_ENTRY: '/custom/host/cli.ts' },
    '/repo',
    '/exec/bun',
  );
  expect(sources).toEqual({ bunPath: '/custom/bun', hubSource: '/custom/host/cli.ts', harnessRoot: '/x-harness' });
});

test('缺省：本机 bun 与旁级 x-harness host-hub 源码入口', () => {
  const sources = resolveResourceSources({}, '/repo', '/exec/bun');
  expect(sources).toEqual({
    bunPath: '/exec/bun',
    hubSource: '/x-harness/apps/host-hub/src/host/cli.ts',
    harnessRoot: '/x-harness',
  });
});

/** harnessRoot 解析 + 依赖闭包收集（plugin-runtime M2：node_modules 子集面）。 */

test('harnessRoot：env 覆盖与缺省旁级检出', () => {
  expect(resolveResourceSources({ PAI_HARNESS_ROOT: '/h' }, '/repo', '/b').harnessRoot).toBe('/h');
  expect(resolveResourceSources({}, '/repo', '/b').harnessRoot).toBe('/x-harness');
});

test('collectHarnessDeps：从 host-hub BFS 收 @x-harness/* 闭包（真实检出上）', () => {
  const sources = resolveResourceSources({}, resolve(import.meta.dir, '..', '..', '..'), process.execPath);
  const { packages, missing } = collectHarnessDeps(sources.harnessRoot);
  expect(missing).toEqual([]);
  expect(packages.length).toBeGreaterThan(5);
  const names = packages.map((dir) => JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).name as string);
  expect(names).toContain('@x-harness/host-hub');
  expect(names).toContain('@x-harness/plugin-manager'); // worker/host.ts 所在包——插件宿主形态的硬依赖
});
