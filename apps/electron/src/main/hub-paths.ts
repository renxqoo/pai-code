import { join, resolve } from 'node:path';

/**
 * 宿主路径解析链（单一真相）：设置覆盖 > 环境变量（开发）> dev 同级探测 > 打包产物缺省。
 * dev 探测只认 monorepo 旁级 host-hub 检出（AGENTS.md dev 拓扑）的固定入口，
 * 不是用户可控输入；打包态一律跳过。
 *
 * 两种执行形态：脚本形态（bunPath=bun、hubEntry=入口路径，dev）与直执行形态
 * （hubEntry=null、bunPath=自包含可执行——bun build --compile 的 host-hub 单文件产物，
 * 打包态）。host-hub 与 worker 同可执行体自 spawn，两种形态均无外部依赖。
 */

export interface HubPaths {
  bunPath: string;
  hubEntry: string | null;
}

export interface ResolveHubPathsDeps {
  /** settings.json hubDev（用户显式覆盖；只表达脚本形态）。 */
  fromSettings: HubPaths | null;
  /** 环境变量 PAI_HUB_ENTRY / PAI_BUN_PATH（开发 shell；只表达脚本形态）。 */
  fromEnv: HubPaths | null;
  /** 打包产物内嵌 hub（resources/host-hub/host-hub，直执行形态）。 */
  fromPackaged: HubPaths | null;
  /** monorepo 仓库根；null 或打包态不做 dev 探测。 */
  devRepoRoot: string | null;
  packaged: boolean;
  exists: (path: string) => boolean;
}

/** dev 同级 host-hub 检出的入口候选（源码形态优先：bun 原生跑 TS，免构建；
 *  dist 产物 --external @x-harness/* 只能原地跑，作为兜底）。 */
export function devHubEntryCandidates(devRepoRoot: string): string[] {
  const hubRoot = resolve(devRepoRoot, '..', 'x-harness', 'apps', 'host-hub');
  return [join(hubRoot, 'src', 'host', 'cli.ts'), join(hubRoot, 'dist', 'host', 'cli.js')];
}

/** 打包资源形态候选（插件宿主优先）：
 *  ① dist 形态：resources/host-hub/dist/host/cli.js + resources/bun/bun——
 *     plugin-manager 保持源码经 resources/host-hub/node_modules 链解析，
 *     worker/host.ts 在磁盘 = 插件线程隔离装载可用（plugin-runtime M2）。
 *  ② 直执行形态：resources/host-hub/host-hub（编译单文件——零插件裁剪版；
 *     worker 模式装载在引擎层明确拒：host 文件不在磁盘）。 */
export interface PackagedHubCandidates {
  /** bun 可执行（dist 形态用） */
  readonly bunPath: string;
  /** dist 形态入口（存在才返回） */
  readonly distEntry: string;
  /** 直执行单文件（存在才返回） */
  readonly compiledEntry: string;
}

export function packagedHubCandidates(resourcesPath: string): PackagedHubCandidates {
  const hubRoot = join(resourcesPath, 'host-hub');
  return {
    bunPath: join(resourcesPath, 'bun', 'bun'),
    distEntry: join(hubRoot, 'dist', 'host', 'cli.js'),
    compiledEntry: join(hubRoot, 'host-hub'),
  };
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
