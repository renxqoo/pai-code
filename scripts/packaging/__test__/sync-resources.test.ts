import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { collectHarnessDeps, collectThirdPartyDirs, resolveResourceSources, workspaceMembers } from '../sync-resources';

/** 资源来源解析回归：env 覆盖优先、缺省走旁级 x-harness host-hub 源码入口（编译输入）。 */

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

/** 症状回归：打包态启动即「宿主未连接」。旧启发式按包名猜目录（packages/<name> |
 *  packages/<group>/<name> 前缀切分），解析不到 packages/core/* 两级布局——
 *  core/session/system-prompt/tools 四包静默漏出 node_modules 子集，dist 形态 hub
 *  启动即 module not found（dev 走源码链不受影响，故只有打包态症状）。 */

test('workspaceMembers：按根 package.json workspaces glob 展开，含 core 组两级布局', () => {
  const sources = resolveResourceSources({}, resolve(import.meta.dir, '..', '..', '..'), process.execPath);
  const members = workspaceMembers(sources.harnessRoot);
  expect(members.size).toBeGreaterThan(5);
  expect(members.get('@x-harness/tools')).toBe(resolve(sources.harnessRoot, 'packages', 'core', 'tools'));
  expect(members.get('@x-harness/session')).toBe(resolve(sources.harnessRoot, 'packages', 'core', 'session'));
  expect(members.get('@x-harness/system-prompt')).toBe(resolve(sources.harnessRoot, 'packages', 'core', 'system-prompt'));
});

test('collectHarnessDeps：core 组闭包全部入场（旧启发式漏收的四个包）', () => {
  const sources = resolveResourceSources({}, resolve(import.meta.dir, '..', '..', '..'), process.execPath);
  const { packages, missing } = collectHarnessDeps(sources.harnessRoot);
  expect(missing).toEqual([]);
  const names = packages.map((dir) => JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).name as string);
  for (const required of ['@x-harness/core', '@x-harness/session', '@x-harness/system-prompt', '@x-harness/tools']) {
    expect(names).toContain(required);
  }

});

/** missing 硬失败语义：闭包引用了 workspace 内不存在的 @x-harness/* 必须浮出，
 *  不再静默跳过（静默 = node_modules 子集缺包 = 打包态 hub 启动即崩）。 */
test('collectHarnessDeps：闭包内 @x-harness/* 解析不到计入 missing（fixture 驱动）', () => {
  const root = mkdtempSync(joinTmp());
  try {
    writeFileSync(joinP(root, 'package.json'), JSON.stringify({ name: 'fixture', workspaces: ['apps/*', 'packages/*', 'packages/core/*'] }));
    mkdirSync(joinP(root, 'apps/host-hub'), { recursive: true });
    writeFileSync(
      joinP(root, 'apps/host-hub/package.json'),
      JSON.stringify({ name: '@x-harness/host-hub', dependencies: { '@x-harness/gone': 'workspace:*', '@x-harness/keep': 'workspace:*' } }),
    );
    mkdirSync(joinP(root, 'packages/core/keep'), { recursive: true });
    writeFileSync(joinP(root, 'packages/core/keep/package.json'), JSON.stringify({ name: '@x-harness/keep' }));
    // 旧启发式也能解析 packages/core/keep？不能——这正是回归点：成员表按 glob 展开才找得到
    const { packages, missing } = collectHarnessDeps(root);
    const names = packages.map((dir) => JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).name as string);
    expect(names).toContain('@x-harness/keep');
    expect(missing).toEqual(['@x-harness/gone']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

});

function joinTmp(): string {
  return `${tmpdir()}/sync-resources-fixture-`;
}


function joinP(...parts: string[]): string {
  return parts.join('/');
}
/** 三方闭包 BFS 回归（症状：打包态缺 openai/typebox/standardwebhooks 逐层爆）：
 *  旧收集只收一层且 scoped 兄弟不展开——pi-ai 的传递依赖全漏。
 *  BFS 从 workspace 包 node_modules 链接出发沿 .bun store 条目兄弟链收齐任意深度。 */
test('collectThirdPartyDirs：任意深度传递依赖闭包（真实检出上）', () => {
  const sources = resolveResourceSources({}, resolve(import.meta.dir, '..', '..', '..'), process.execPath);
  const { packages } = collectHarnessDeps(sources.harnessRoot);
  const thirdParty = collectThirdPartyDirs(packages);
  expect(thirdParty.length).toBeGreaterThan(20);
  const names = thirdParty.map((dir) => JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).name as string);
  // 一层（pi-ai 直接依赖）与二层（sdk 的 standardwebhooks）都必须在场
  for (const required of ['@earendil-works/pi-ai', 'openai', 'typebox', '@anthropic-ai/sdk', 'standardwebhooks']) {
    expect(names).toContain(required);
  }

});
