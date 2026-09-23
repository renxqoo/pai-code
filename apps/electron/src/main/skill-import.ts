import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { SkillCandidateView } from '@paiapp/contracts';
import {
  appError,
  discoverSkillDirs,
  isPathInside,
  type ScanDirent,
  type SkillSourcePort,
} from '@paiapp/api';

/**
 * 技能源面实现（T42 M2）：批准根解析 + realpath 归一的越界拒绝 + 两深度候选发现。
 * 安全面（T42 §6）：sourcePath 的 realpath 必须位于批准根（三个内置源根 ∪ 用户经
 * 对话框批准的目录）之下——否则被攻陷的渲染层可把 ~/.ssh 之类目录拷进技能根再借
 * 模型工具读走。**不落盘**：落盘与形态判定经 hub skills/install|inspect（D1=H）。
 * fs 全注入（缺省 node:fs/promises）——单测用真实临时目录夹具。
 */

export interface SkillImporterFs {
  readdir(path: string, options: { withFileTypes: true }): Promise<ScanDirent[]>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  realpath(path: string): Promise<string>;
}

export interface SkillImporterDeps {
  /** home 根（解析三个内置源根；单测注入临时 home 隔离）。 */
  homeDir?: string;
  /** 用户批准的本地目录（对话框选中集合的惰性快照；批准根收窄用）。 */
  pickedRoots?: () => readonly string[];
  /** fs 面（缺省 node:fs/promises）。 */
  fs?: SkillImporterFs;
}

/** 内置源根（T42 D2 写死三条 + 手动选择；不扫目标根 ~/.x-harness/skills）。 */
export function builtInSkillRoots(homeDir: string): Array<{ path: string; origin: SkillCandidateView['origin'] }> {
  return [
    { path: join(homeDir, '.agents', 'skills'), origin: 'agents' },
    { path: join(homeDir, '.pi', 'agent', 'skills'), origin: 'pi' },
    { path: join(homeDir, '.claude', 'skills'), origin: 'claude' },
  ];
}

export function createSkillImporter(deps: SkillImporterDeps = {}): SkillSourcePort {
  const fs: SkillImporterFs = deps.fs ?? { readdir, stat, realpath };
  const homeDir = deps.homeDir ?? homedir();

  /** 批准根（realpath 缺失根直接缺席——不存在的根不可能包含任何东西）。 */
  const approvedRoots = async (): Promise<Array<{ realPath: string; origin: SkillCandidateView['origin'] }>> => {
    const roots: Array<{ path: string; origin: SkillCandidateView['origin'] }> = [
      ...builtInSkillRoots(homeDir),
      ...(deps.pickedRoots?.() ?? []).map((path) => ({ path, origin: 'picked' as const })),
    ];
    const out: Array<{ realPath: string; origin: SkillCandidateView['origin'] }> = [];
    for (const root of roots) {
      const realPath = await fs.realpath(root.path).catch(() => undefined);
      if (realPath !== undefined) out.push({ realPath, origin: root.origin });
    }
    return out;
  };

  /** 白名单门：realpath 归一后必须位于某批准根之下（等值放行——用户可直接选中技能目录）。 */
  const gate = async (sourcePath: string) => {
    const realPath = await fs.realpath(sourcePath).catch(() => undefined);
    if (realPath === undefined) {
      return { ok: false as const, error: appError('skill_source_invalid', `source path not found: ${sourcePath}`) };
    }
    for (const root of await approvedRoots()) {
      if (isPathInside(root.realPath, realPath)) return { ok: true as const, origin: root.origin };
    }
    return { ok: false as const, error: appError('skill_source_invalid', `source path outside approved roots: ${sourcePath}`) };
  };

  return {
    async gate(sourcePath) {
      return gate(sourcePath);
    },
    async discover(sourcePath) {
      if (sourcePath !== undefined) {
        const approved = await gate(sourcePath);
        if (!approved.ok) return approved;
        return {
          ok: true,
          found: await discoverSkillDirs(fs, sourcePath, approved.origin),
        };
      }
      const found: Array<{ sourcePath: string; origin: SkillCandidateView['origin'] }> = [];
      for (const root of await approvedRoots()) {
        // 拾取根只随显式 sourcePath 扫描（用户选哪扫哪）；内置源根全扫
        if (root.origin === 'picked') continue;
        found.push(...(await discoverSkillDirs(fs, root.realPath, root.origin)));
      }
      return { ok: true, found };
    },
  };
}
