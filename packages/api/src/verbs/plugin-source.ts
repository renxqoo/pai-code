/**
 * 插件源面端口（plugin-runtime §M3）：批准根门 + 候选发现。
 * 主进程实现住 apps/electron/src/main/plugin-import.ts；本文件只定契约。
 * 安全面：sourcePath 的 realpath 必须位于批准根（手选目录 ∪ agent propose 链）
 * 之下——渲染层不可把任意目录（如 ~/.ssh）经导入面拷进 vendor 根。
 */
import type { ApiError } from '@paiapp/contracts';
import type { PluginCandidateView } from '@paiapp/contracts';

export interface PluginSourcePort {
  /** 候选发现（含白名单门）；sourcePath 缺省 = 手选目录集合全扫。 */
  discover(sourcePath?: string): Promise<
    { ok: true; found: Array<{ sourcePath: string; origin: PluginCandidateView['origin'] }> } | { ok: false; error: ApiError }
  >;
  /** 导入源门（realpath 归一 + 批准根包含判定）；返回来源标签。 */
  gate(sourcePath: string): Promise<
    { ok: true; origin: PluginCandidateView['origin'] } | { ok: false; error: ApiError }
  >;
}

/** fail-closed 缺省源面（未接线形态）：门恒拒、扫描恒空——不放大能力面。 */
export const failClosedPluginSources: PluginSourcePort = {
  discover: () => Promise.resolve({ ok: true, found: [] }),
  gate: (sourcePath) => Promise.resolve({
    ok: false,
    error: { kind: 'plugin_source_invalid', message: `plugin source gate not wired: ${sourcePath}` },
  }),
};
