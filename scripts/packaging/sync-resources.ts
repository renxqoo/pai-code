import { chmodSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * 冒烟包资源同步（T9 §未决项 Spike 1）：把 bun 二进制与 hub dist 拷入仓库根
 * resources/（bun/bun + pai-cli/cli.js，即打包态运行时的 extraResources 布局，
 * 见主进程 hub-paths 解析链）。来源默认本机 bun（process.execPath）与 AGENTS.md
 * dev 拓扑的旁级 pi 检出产物；PAI_BUN_PATH / PAI_HUB_ENTRY 可覆盖。
 */

export interface ResourceSources {
  bunPath: string;
  hubEntry: string;
}

/** 资源来源解析（纯函数）：env 覆盖 > 开发缺省（旁级 pi/app/dist/cli.js） */
export function resolveResourceSources(
  env: Record<string, string | undefined>,
  repoRoot: string,
  execPath: string,
): ResourceSources {
  return {
    bunPath: env['PAI_BUN_PATH'] ?? execPath,
    hubEntry: env['PAI_HUB_ENTRY'] ?? join(repoRoot, '..', 'pi', 'app', 'dist', 'cli.js'),
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
  for (const source of [sources.bunPath, sources.hubEntry]) {
    const size = statSync(source, { throwIfNoEntry: false })?.size;
    if (size === undefined) {
      console.error(`[sync-resources] source missing: ${source}`);
      process.exit(1);
    }
    console.log(`[sync-resources] ${basename(source)} <- ${source} (${(size / 1048576).toFixed(1)} MB)`);
  }
  copyExecutable(sources.bunPath, join(repoRoot, 'resources', 'bun', 'bun'));
  copyExecutable(sources.hubEntry, join(repoRoot, 'resources', 'pai-cli', 'cli.js'));
  console.log('[sync-resources] resources/ ready');
}

if (import.meta.main) main();
