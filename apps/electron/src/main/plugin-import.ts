/**
 * 插件源面实现（plugin-runtime §M3）：批准根 = 用户手选目录集合（对话框批准）∪
 * agent propose 链登记的源目录。安全面与 skill-import 同构：sourcePath 的
 * realpath 必须位于批准根之下——渲染层不可把任意目录拷进 vendor 根。
 * 候选发现：一深度（批准根的直接子目录含 plugin.json 即候选）。
 * fs 全注入（缺省 node:fs/promises）——单测用真实临时目录夹具。
 */
import { readdir, realpath, stat } from 'node:fs/promises';

import { appError, isPathInside } from '@paiapp/api';
import type { PluginCandidateView } from '@paiapp/contracts';
import type { PluginSourcePort } from '@paiapp/api';

export interface PluginImporterFs {
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  stat(path: string): Promise<{ isFile(): boolean }>;
  realpath(path: string): Promise<string>;
}

export interface PluginImporterDeps {
  /** 用户批准的本地目录（对话框选中集合的惰性快照）。 */
  pickedRoots?: () => readonly string[];
  /** agent propose 链登记的源目录（hub plugins/trusted_source/list 的提案源——
   *  批准根第二腿：提案确认后的 install 经此门放行 origin:agent 链）。 */
  agentProposalRoots?: () => Promise<readonly string[]>;
  /** fs 面（缺省 node:fs/promises）。 */
  fs?: PluginImporterFs;
}

export function createPluginImporter(deps: PluginImporterDeps = {}): PluginSourcePort {
  const fs: PluginImporterFs = deps.fs ?? { readdir, stat, realpath };

  /** 批准根 realpath 归一（缺失根缺席——不存在的根不可能包含任何东西）。 */
  const approvedRoots = async (): Promise<string[]> => {
    const roots = [...(deps.pickedRoots?.() ?? []), ...(await deps.agentProposalRoots?.().catch(() => []) ?? [])];
    const out: string[] = [];
    for (const root of roots) {
      const realPath = await fs.realpath(root).catch(() => undefined);
      if (realPath !== undefined) out.push(realPath);
    }
    return out;
  };

  const gate = async (sourcePath: string) => {
    const realPath = await fs.realpath(sourcePath).catch(() => undefined);
    if (realPath === undefined) {
      return { ok: false as const, error: appError('plugin_source_invalid', `source path not found: ${sourcePath}`) };
    }
    for (const root of await approvedRoots()) {
      if (isPathInside(root, realPath)) return { ok: true as const, origin: 'picked' as const };
    }
    return { ok: false as const, error: appError('plugin_source_invalid', `source path outside approved roots: ${sourcePath}`) };
  };

  return {
    async gate(sourcePath) {
      return gate(sourcePath);
    },
    async discover(sourcePath) {
      if (sourcePath !== undefined) {
        const verdict = await gate(sourcePath);
        if (!verdict.ok) return { ok: false, error: verdict.error };
        return { ok: true, found: [{ sourcePath, origin: 'picked' }] };
      }
      const found: Array<{ sourcePath: string; origin: PluginCandidateView['origin'] }> = [];
      for (const root of await approvedRoots()) {
        const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const candidate = `${root}/${entry.name}`;
          const manifest = await fs.stat(`${candidate}/plugin.json`).catch(() => undefined);
          if (manifest?.isFile()) found.push({ sourcePath: candidate, origin: 'picked' });
        }
      }
      return { ok: true, found };
    },
  };
}
