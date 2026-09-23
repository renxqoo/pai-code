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
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

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

/** @x-harness/* 包依赖闭包收集（workspace 链内包间依赖 + 第三方运行时依赖）：
 *  从 host-hub package.json 依赖出发 BFS，收集每个包目录整树（src + package.json +
 *  自带 node_modules 第三方）。 Bun workspace 的 node_modules 在根（hoisted）——
 *  第三方依赖按根 node_modules 同步整树拷贝。 */
export function collectHarnessDeps(harnessRoot: string): { packages: string[]; missing: string[] } {
  const hubManifest = join(harnessRoot, 'apps', 'host-hub', 'package.json');
  if (!existsSync(hubManifest)) return { packages: [], missing: [hubManifest] };
  const seen = new Set<string>();
  const queue: string[] = ['@x-harness/host-hub'];
  const packages: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    // workspace 包路径解析：@x-harness/foo → packages/foo | packages/<group>/foo
    const short = name.replace(/^@x-harness\//, '');
    const candidates = [
      join(harnessRoot, 'packages', short),
      join(harnessRoot, 'apps', short),
      join(harnessRoot, 'packages', short.split('-')[0] as string, short),
      join(harnessRoot, 'packages', short.replace(/-([a-z]+)$/, '/$1')),
    ].filter((dir) => existsSync(join(dir, 'package.json')));
    const pkgDir = candidates[0];
    if (pkgDir === undefined) continue; // 非 workspace 包（第三方）——根 node_modules 兜底
    packages.push(pkgDir);
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return { packages, missing: [] };
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
  copyExecutable(sources.bunPath, join(repoRoot, 'resources', 'bun', 'bun'));

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
  // 第三方依赖（根 node_modules hoisted）：host-hub 依赖闭包里的非 @x-harness 包
  const thirdParty = new Set<string>();
  for (const pkgDir of packages) {
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (!dep.startsWith('@x-harness/')) thirdParty.add(dep);
    }
  }
  // Bun workspaces 非 hoist：第三方住依赖包自己的 node_modules（apps/host-hub/node_modules/...）
  const thirdPartyDirs: string[] = [];
  for (const pkgDir of packages) {
    const localNm = join(pkgDir, 'node_modules');
    for (const dep of thirdParty) {
      const dir = join(localNm, ...dep.split('/'));
      if (existsSync(join(dir, 'package.json')) && !thirdPartyDirs.includes(dir)) thirdPartyDirs.push(dir);
    }
  }

  for (const dir of thirdPartyDirs) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
    const target = join(nmOut, ...manifest.name.split('/'));
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
