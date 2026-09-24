import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * rg 内置二进制首启放置（hub grep 的硬依赖——TOOLBOX §5 获取形态的 app 侧安装器动作）：
 * 打包资源 resources/host-hub/bin/rg → <agentDir>/bin/rg（hub 解析链 rgBinDir 同源）。
 * 幂等：目标在场（真文件）即跳过——不覆盖（用户/后续版本管理）；资源缺席静默跳过
 * （dev 形态无打包资源——hub 落 PATH 探测，不阻塞启动）。放置失败不致命（同样落 PATH），
 * 记日志即可；bin/ 目录同时是 hub 侧 fenceKit 写保护对象，放置后 agent 不可篡改。
 */

export interface RgSeedDeps {
  /** 打包资源根（process.resourcesPath）；dev 无资源形态传 null。 */
  resourcesPath: string | null;
  /** hub 配置目录（HUB_AGENT_DIR——放置目标 <agentDir>/bin/rg）。 */
  agentDir: string;
  exists: (path: string) => boolean;
  isFile: (path: string) => boolean;
  log?: (message: string) => void;
}

export function rgResourcePath(resourcesPath: string): string {
  return join(resourcesPath, 'host-hub', 'bin', 'rg');
}

export function rgPlacedPath(agentDir: string): string {
  return join(agentDir, 'bin', 'rg');
}

export function seedBundledRg(deps: RgSeedDeps): void {
  const log = deps.log ?? (() => {});
  if (deps.resourcesPath === null) return; // dev 形态无打包资源——hub 落 PATH
  const from = rgResourcePath(deps.resourcesPath);
  if (!deps.isFile(from)) {
    log(`rg_seed: resource missing (${from}) — hub falls back to PATH`);
    return;
  }
  const to = rgPlacedPath(deps.agentDir);
  if (deps.isFile(to)) return; // 幂等：在场即跳过（不覆盖）
  try {
    mkdirSync(join(to, '..'), { recursive: true });
    copyFileSync(from, to);
    chmodSync(to, 0o755);
    log(`rg_seed: placed ${to}`);
  } catch (error) {
    // 放置失败不阻塞启动：hub 解析链落 PATH（grep 缺 rg 时自身有可行动报错）
    log(`rg_seed: place failed (${String(error)}) — hub falls back to PATH`);
  }
}
