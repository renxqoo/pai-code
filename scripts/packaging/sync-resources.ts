/**
 * 冒烟包资源同步：仓库根 resources/ 填充打包态运行时载荷——
 * ① bun/bun（脚本形态覆盖用）；
 * ② host-hub/host-hub（bun build --compile 单文件——零插件裁剪形态：产物形态
 *    worker 自举 + dist/worker/main.js 双产物装载；
 * ③ host-hub/dist/（bun build 多文件产物 + --external @x-harness/*）——插件宿主
 *    形态（plugin-manager 保持源码经 node_modules 链解析，worker/host.ts 在磁盘）；
 * ④ host-hub/node_modules/（@x-harness/* 子集——dist 形态的运行时依赖闭包，
 *    从 x-harness 检出的 workspace 链按包依赖图收集）。
 * 来源默认 AGENTS.md dev 拓扑的旁级 x-harness 检出；PAI_HUB_ENTRY / PAI_BUN_PATH 可覆盖。
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

export interface ResourceSources {
  bunPath: string;
  /** host-hub 源码入口（编译输入），非最终产物路径。 */
  hubSource: string;
  /** x-harness 检出根（node_modules 子集收集范围）。 */
  harnessRoot: string;
}

/** 资源来源解析（纯函数）：env 覆盖 > 开发缺省（旁级 x-harness 源码入口） */
export function resolveResourceSources(
  env: Record<string, string | undefined>,
  repoRoot: string,
  execPath: string,
): ResourceSources {
  const harnessRoot = env['PAI_HARNESS_ROOT'] ?? resolve(repoRoot, '..', 'x-harness');
  return {
    bunPath: env['PAI_BUN_PATH'] ?? execPath,
    hubSource:
      env['PAI_HUB_ENTRY'] ?? join(harnessRoot, 'apps', 'host-hub', 'src', 'host', 'cli.ts'),
    harnessRoot,
  };
}

function copyExecutable(from: string, to: string): void {
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(from, to, { force: true });
  chmodSync(to, 0o755);
}

/** workspace 成员清单（单一真相：x-harness 根 package.json 的 workspaces glob 展开）。
 *  旧启发式按包名猜目录（packages/<name> | packages/<group>/<name> 前缀切分），
 *  解析不到 core 组两级布局（@x-harness/tools 实际住 packages/core/tools）——
 *  node_modules 子集静默缺包，打包态 hub 启动即 module not found（dev 走源码链不受影响）。
 *  glob 形态限于清单实际使用的单段 *（packages/*、packages/core/*、apps/*）。 */
export function workspaceMembers(harnessRoot: string): Map<string, string> {
  const rootManifestPath = join(harnessRoot, 'package.json');
  const members = new Map<string, string>();
  if (!existsSync(rootManifestPath)) return members;
  const workspaces = (JSON.parse(readFileSync(rootManifestPath, 'utf8')) as {
    workspaces?: string[];
  }).workspaces;
  if (!Array.isArray(workspaces)) return members;
  for (const glob of workspaces) {
    const starIndex = glob.indexOf('*');
    if (starIndex < 0) continue;
    if (glob.includes('**')) continue; // 双段通配不在清单使用面，明确不支持
    const prefix = glob.slice(0, starIndex);
    const scanRoot = join(harnessRoot, prefix);
    if (!existsSync(scanRoot)) continue;
    const starSegments = glob.split('*').length - 1; // 通配段数（每段匹配一层目录名）
    const stack: Array<{ dir: string; matched: number }> = [{ dir: scanRoot, matched: 0 }];
    while (stack.length > 0) {
      const { dir, matched } = stack.pop() as { dir: string; matched: number };
      if (matched === starSegments) {
        // 到达通配末端：目录本身即 workspace 成员候选
        const manifest = join(dir, 'package.json');
        if (existsSync(manifest)) {
          const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name;
          if (name !== undefined && !members.has(name)) members.set(name, dir);
        }
        continue;
      }
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) stack.push({ dir: join(dir, entry.name), matched: matched + 1 });
      }
    }
  }
  return members;
}

/** @x-harness/* 包依赖闭包收集（workspace 链内包间依赖 + 第三方运行时依赖）：
 *  从 host-hub package.json 依赖出发 BFS，收集每个包目录整树（src + package.json +
 *  自带 node_modules 第三方）。 Bun workspace 的 node_modules 在根（hoisted）——
 *  第三方依赖按根 node_modules 同步整树拷贝。
 *  闭包内任何 @x-harness/* 解析不到 → 计入 missing（main 层硬失败）：
 *  静默跳过会让 node_modules 子集缺包，打包态 hub 启动即 module not found。 */
export function collectHarnessDeps(harnessRoot: string): { packages: string[]; missing: string[] } {
  const hubManifest = join(harnessRoot, 'apps', 'host-hub', 'package.json');
  if (!existsSync(hubManifest)) return { packages: [], missing: [hubManifest] };
  const members = workspaceMembers(harnessRoot);
  const seen = new Set<string>();
  const queue: string[] = ['@x-harness/host-hub'];
  const packages: string[] = [];
  const missing: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    const pkgDir = members.get(name);
    if (pkgDir === undefined) {
      if (name.startsWith('@x-harness/')) missing.push(name); // workspace 内包缺失是硬错误，不再静默跳过
      continue; // 非 workspace 包（第三方）——本地 node_modules 兜底
    }
    packages.push(pkgDir);
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return { packages, missing };
}

/** node_modules 目录下包名清单（展开 @scope；链接与目录都算——Bun isolated install
 *  的依赖全是符号链接，Dirent.isDirectory() 对链接返回 false）。 */
function listPackagesInNodeModules(nmDir: string): string[] {
  if (!existsSync(nmDir)) return [];
  const isDirLike = (e: { isDirectory: () => boolean; isSymbolicLink: () => boolean }) =>
    e.isDirectory() || e.isSymbolicLink();
  const names: string[] = [];
  for (const e of readdirSync(nmDir, { withFileTypes: true })) {
    if (e.name === '.bin' || e.name.startsWith('._') || !isDirLike(e)) continue;
    if (e.name.startsWith('@')) {
      const scopeDir = join(nmDir, e.name);
      if (!existsSync(scopeDir)) continue;
      for (const inner of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!isDirLike(inner)) continue;
        if (existsSync(join(scopeDir, inner.name, 'package.json'))) names.push(`${e.name}/${inner.name}`);
      }
      continue;
    }
    if (existsSync(join(nmDir, e.name, 'package.json'))) names.push(e.name);
  }
  return names;
}

/** 包目录 → 所在 .bun store 条目的 node_modules（向上走到名为 node_modules 的目录）。
 *  scoped 包（@scope/pkg）的父目录是 @scope 而非 node_modules，逐级上溯收口。 */
function entryNodeModulesOf(pkgDir: string): string | null {
  let cur = realpathSync(pkgDir);
  for (;;) {
    if (basename(cur) === 'node_modules') return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** 三方依赖闭包（Bun isolated install）：从 workspace 包 node_modules 里的第三方
 *  链接出发，沿 .bun store 条目兄弟链 BFS——每个条目 node_modules 兄弟位即该包
 *  全部传递依赖（openai/typebox 一层、standardwebhooks 二层……任意深度可达）。
 *  返回去重后的包真实目录（cpSync 解符号链接 → 落地为实文件）。 */
export function collectThirdPartyDirs(packages: string[]): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const pkgDir of packages) {
    const localNm = join(pkgDir, 'node_modules');
    for (const name of listPackagesInNodeModules(localNm)) {
      if (name.startsWith('@x-harness/')) continue; // workspace 链接包已整树收集
      const real = realpathSync(join(localNm, ...name.split('/')));
      if (!seen.has(real)) {
        seen.add(real);
        queue.push(real);
      }
    }
  }
  const dirs: string[] = [];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    dirs.push(dir);
    const entryNm = entryNodeModulesOf(dir);
    if (entryNm === null) continue;
    for (const name of listPackagesInNodeModules(entryNm)) {
      const real = realpathSync(join(entryNm, ...name.split('/')));
      if (!seen.has(real)) {
        seen.add(real);
        queue.push(real);
      }
    }
  }
  return dirs;
}

/** rg 内置二进制放置（TOOLBOX §5 获取形态）：x-harness staging（fetch:rg 产物）→
 *  resources/host-hub/bin/rg。hub 运行时解析链 rgBinDir = <HUB_AGENT_DIR>/bin，
 * 首启由 Pai 主进程从本资源拷贝放置。缺席 = x-harness 未跑 fetch:rg（打包机错序）——
 * 硬失败不静默（hub grep 会 SEARCH_RG_UNAVAILABLE）。 */
export function rgResourcePaths(harnessRoot: string): { readonly from: string; readonly to: string } {
  return { from: join(harnessRoot, 'apps', 'host-hub', 'dist', 'bin', 'rg'), to: 'host-hub/bin/rg' };
}

function main(): void {
  const repoRoot = resolve(import.meta.dir, '..', '..');
  const sources = resolveResourceSources(process.env, repoRoot, process.execPath);
  for (const source of [sources.bunPath, sources.hubSource]) {
    const size = statSync(source, { throwIfNoEntry: false })?.size;
    if (size === undefined) {
      console.error(`[sync-resources] source missing: ${source}`);
      process.exit(1);
    }
    console.log(`[sync-resources] ${basename(source)} <- ${source} (${(size / 1048576).toFixed(1)} MB)`);
  }
  // rg staging 缺席 = 打包机错序（fetch:rg 先于 package）——硬失败
  const rgPaths = rgResourcePaths(sources.harnessRoot);
  const rgSize = statSync(rgPaths.from, { throwIfNoEntry: false })?.size;
  if (rgSize === undefined) {
    console.error(`[sync-resources] rg missing: ${rgPaths.from} (run 'bun run fetch:rg' in x-harness first)`);
    process.exit(1);
  }
  console.log(`[sync-resources] rg <- ${rgPaths.from} (${(rgSize / 1048576).toFixed(1)} MB)`);
  copyExecutable(sources.bunPath, join(repoRoot, 'resources', 'bun', 'bun'));
  copyExecutable(rgPaths.from, join(repoRoot, 'resources', rgPaths.to));

  // ① 编译单文件（零插件裁剪形态）
  const hubOut = join(repoRoot, 'resources', 'host-hub', 'host-hub');
  mkdirSync(join(hubOut, '..'), { recursive: true });
  const compiled = spawnSync(sources.bunPath, ['build', '--compile', sources.hubSource, '--outfile', hubOut], {
    stdio: 'inherit',
  });
  if (compiled.status !== 0) {
    console.error(`[sync-resources] host-hub compile failed (exit ${compiled.status})`);
    process.exit(1);
  }
  chmodSync(hubOut, 0o755);
  console.log(`[sync-resources] host-hub -> ${hubOut} (${(statSync(hubOut).size / 1048576).toFixed(1)} MB)`);

  // ② dist 多文件（插件宿主形态）：bun build --outdir（与 x-harness 仓 build 脚本同参）
  const hubDist = join(repoRoot, 'resources', 'host-hub', 'dist');
  const distOut = spawnSync(
    sources.bunPath,
    ['build', sources.hubSource, join(sources.harnessRoot, 'apps/host-hub/src/worker/main.ts'), '--outdir', hubDist, '--target', 'bun', '--format', 'esm', '--external', '@x-harness/*'],
    { stdio: 'inherit' },
  );
  if (distOut.status !== 0) {
    console.error(`[sync-resources] host-hub dist build failed (exit ${distOut.status})`);
    process.exit(1);
  }
  console.log(`[sync-resources] host-hub dist -> ${hubDist}`);

  // ③ node_modules 子集（dist 形态运行时闭包）
  const { packages, missing } = collectHarnessDeps(sources.harnessRoot);
  if (missing.length > 0) {
    console.error(`[sync-resources] harness deps missing: ${missing.join(', ')}`);
    process.exit(1);
  }
  const nmOut = join(repoRoot, 'resources', 'host-hub', 'node_modules');
  for (const pkgDir of packages) {
    const name = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name as string;
    const target = join(nmOut, ...name.split('/'));
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(pkgDir)) {
      if (entry === 'node_modules' || entry === '__test__' || entry === 'dist') continue;
      cpSync(join(pkgDir, entry), join(target, entry), { recursive: true, force: true });
    }
  }
  // ④ 三方依赖闭包（Bun isolated install 的 .bun store 兄弟链 BFS）
  const thirdPartyDirs = collectThirdPartyDirs(packages);
  for (const dir of thirdPartyDirs) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
    const target = join(nmOut, ...manifest.name.split('/'));
    if (existsSync(join(target, 'package.json'))) continue; // 已在场（含 workspace 包优先）
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.bin') continue;
      cpSync(join(dir, entry), join(target, entry), { recursive: true, force: true });
    }
  }
  console.log(`[sync-resources] node_modules subset: ${packages.length} workspace + ${thirdPartyDirs.length} third-party packages`);
  console.log('[sync-resources] resources/ ready');
}

if (import.meta.main) main();
