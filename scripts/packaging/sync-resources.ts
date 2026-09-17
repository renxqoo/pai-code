import { chmodSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * 冒烟包资源同步（T9 §未决项 Spike 1）：把 bun 二进制与 host-hub 编译产物放入仓库根
 * resources/（bun/bun + host-hub/host-hub，即打包态运行时的 extraResources 布局，
 * 见主进程 hub-paths 解析链）。host-hub 产物 = `bun build --compile` 单文件可执行
 * （直执行形态：hub 与 worker 同可执行体自 spawn，无 node_modules 依赖）；bun 二进制
 * 供 settings hubDev 脚本形态覆盖用。来源默认 AGENTS.md dev 拓扑的旁级 my-agent 检出
 * 源码入口与本机 bun；PAI_HUB_ENTRY（源入口）与 PAI_BUN_PATH 可覆盖。
 */

export interface ResourceSources {
  bunPath: string;
  /** host-hub 源码入口（编译输入），非最终产物路径。 */
  hubSource: string;
}

/** 资源来源解析（纯函数）：env 覆盖 > 开发缺省（旁级 my-agent 源码入口） */
export function resolveResourceSources(
  env: Record<string, string | undefined>,
  repoRoot: string,
  execPath: string,
): ResourceSources {
  return {
    bunPath: env['PAI_BUN_PATH'] ?? execPath,
    hubSource:
      env['PAI_HUB_ENTRY'] ?? join(repoRoot, '..', 'my-agent', 'packages', 'host-hub', 'src', 'host', 'cli.ts'),
  };
}

function copyExecutable(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, 0o755);
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
  const hubOut = join(repoRoot, 'resources', 'host-hub', 'host-hub');
  const compiled = spawnSync(sources.bunPath, ['build', '--compile', sources.hubSource, '--outfile', hubOut], {
    stdio: 'inherit',
  });
  if (compiled.status !== 0) {
    console.error(`[sync-resources] host-hub compile failed (exit ${compiled.status})`);
    process.exit(1);
  }
  chmodSync(hubOut, 0o755);
  console.log(`[sync-resources] host-hub -> ${hubOut} (${(statSync(hubOut).size / 1048576).toFixed(1)} MB)`);
  console.log('[sync-resources] resources/ ready');
}

if (import.meta.main) main();
