/** 插件管理域命令与应答形状（plugin-runtime §M3；从 hub-commands 拆出——文件行数宪法）。 */
import type { PluginProposalRow } from './plugin-views';

export type { PluginProposalRow };
/** 插件清单（builtin + vendor 合并视图；状态含 apiVersion 拒载原因）。 */
export interface PluginsListCmd {
  type: 'plugins/list';
}

/** 插件候选形态检查（plugin.json manifest + 全源文件零 @x-harness/* import 静态扫）。 */
export interface PluginsInspectCmd {
  type: 'plugins/inspect';
  /** 插件源目录绝对路径（plugin.json 父目录）；1..200。 */
  sourcePaths: string[];
}

/** 插件安装（全树拷贝 vendor 根 + registry 哈希落账；origin = agent 注册链标记）。 */
export interface PluginsInstallCmd {
  type: 'plugins/install';
  sourcePath: string;
  overwrite?: boolean;
  origin?: 'manual' | 'agent';
  /** agent 源必带：已确认提案 id（一次性消费——防重放与伪造） */
  proposalId?: string;
}

/** 卸载（热卸活跃 thread + 清 registry；vendor 专属——builtin 走 set_enabled）。 */
export interface PluginsUninstallCmd {
  type: 'plugins/uninstall';
  name: string;
}

/** 启停（写 hub plugins.disabled；builtin ∪ 已装 vendor 名收口）。 */
export interface PluginsSetEnabledCmd {
  type: 'plugins/set_enabled';
  name: string;
  enabled: boolean;
}

/** 移除 vendor 件（删 vendor 目录 + registry 条目；builtin 拒）。 */
export interface PluginsRemoveCmd {
  type: 'plugins/remove';
  name: string;
}

/** 热装（线程域：当前 thread world 内即时装载；路径从 registry/词表现读）。 */
export interface PluginsHotInstallCmd {
  type: 'plugins/hot_install';
  threadId: string;
  name: string;
}

/** 热卸（线程域：world 内即时卸载；依赖未清且未 force 拒）。 */
export interface PluginsHotUninstallCmd {
  type: 'plugins/hot_uninstall';
  threadId: string;
  name: string;
  force?: boolean;
}

/** plugins/list 应答行（source 两值——third-party 语义由 origin 承载）。 */
export interface PluginRow {
  name: string;
  source: 'builtin' | 'vendor';
  origin: 'manual' | 'agent' | null;
  version: number | null;
  enabled: boolean;
  status: 'active' | 'failed' | 'disabled' | 'unloaded';
  disabledReason: string | null;
  description: string | null;
  path: string | null;
}

export type PluginsListData = { plugins: PluginRow[] };

/** plugins/inspect 应答单项（blocked 携自然语言 reason——manifest/扫描面无问题码闭集）。 */
export type PluginInspectedCandidate =
  | { sourcePath: string; state: 'ready'; manifest: { name: string; apiVersion: number; description?: string } }
  | { sourcePath: string; state: 'rename'; manifest: { name: string; apiVersion: number; description?: string } }
  | { sourcePath: string; state: 'blocked'; problem: string };

export type PluginsInspectData = { results: PluginInspectedCandidate[] };

export type PluginsInstallData = { plugin: { name: string; path: string; sha256: string; skippedEntries: number } };

/** agent 注册链（plugin-runtime §5）：提案面板三命令。 */
export interface PluginsTrustedSourceListCmd {
  type: 'plugins/trusted_source/list';
}

export interface PluginsTrustedSourceConfirmCmd {
  type: 'plugins/trusted_source/confirm';
  proposalId: string;
}

export interface PluginsTrustedSourceRejectCmd {
  type: 'plugins/trusted_source/reject';
  proposalId: string;
}



export type PluginsTrustedSourceListData = { proposals: PluginProposalRow[] };

