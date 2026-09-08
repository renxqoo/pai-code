import { join, resolve } from 'node:path';

/**
 * 宿主路径解析链（单一真相）：设置覆盖 > 环境变量（开发）> dev 同级探测 > 打包产物缺省。
 * dev 探测只认 monorepo 旁级 pi 检出（AGENTS.md dev 拓扑）的固定两个入口，
 * 不是用户可控输入；打包态一律跳过。
 */

export interface HubPaths {
  bunPath: string;
  hubEntry: string;
}

export interface ResolveHubPathsDeps {
  /** settings.json hubDev（用户显式覆盖）。 */
  fromSettings: HubPaths | null;
  /** 环境变量 PAI_HUB_ENTRY / PAI_BUN_PATH（开发 shell）。 */
  fromEnv: HubPaths | null;
  /** 打包产物内嵌 hub（resources/pai-cli/cli.js）。 */
  fromPackaged: HubPaths | null;
  /** monorepo 仓库根；null 或打包态不做 dev 探测。 */
  devRepoRoot: string | null;
  packaged: boolean;
  exists: (path: string) => boolean;
}

/** dev 同级 hub 检出的入口候选（构建产物优先于源码）。 */
export function devHubEntryCandidates(devRepoRoot: string): string[] {
  const hubRoot = resolve(devRepoRoot, '..', 'pi', 'app');
  return [join(hubRoot, 'dist', 'cli.js'), join(hubRoot, 'src', 'cli.ts')];
}

export function resolveHubPaths(deps: ResolveHubPathsDeps): HubPaths | null {
  if (deps.fromSettings !== null) return deps.fromSettings;
  if (deps.fromEnv !== null) return deps.fromEnv;
  if (!deps.packaged && deps.devRepoRoot !== null) {
    const entry = devHubEntryCandidates(deps.devRepoRoot).find((candidate) => deps.exists(candidate));
    if (entry !== undefined) return { bunPath: 'bun', hubEntry: entry };
  }
  return deps.fromPackaged;
}
