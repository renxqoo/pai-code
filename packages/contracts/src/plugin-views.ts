/** 插件域视图与方法 schema（从 api.ts 拆出——文件行数宪法）。
 * PluginView.source 两值：「第三方插件」语义由 origin 承载（manual/agent）——
 * registry 条目只有 builtin|vendor 两源，不产第三值。 */
import { z } from 'zod';

const empty = z.object({}).strict();

/** agent 提案行（plugin_propose 登记态；UI 审批面板数据源）。 */
export const PluginProposalRowSchema = z.object({
  proposalId: z.string(),
  sourcePath: z.string(),
  name: z.string(),
  description: z.string(),
  requestedCapabilities: z.array(z.string()),
  sha256: z.string(),
  createdAt: z.number(),
  confirmed: z.boolean(),
}).strict();
export type PluginProposalRow = z.infer<typeof PluginProposalRowSchema>;

/** 插件视图（plugins/list；source 两值——「第三方」语义由 origin 承载）。 */
export const PluginViewSchema = z
  .object({
    name: z.string(),
    /** builtin = hub 词表内件；vendor = 已安装第三方件（vendor 根内）。 */
    source: z.enum(['builtin', 'vendor']),
    /** 注册发起方：manual = 管理页手选导入；agent = agent propose 链确认；builtin 恒 null。 */
    origin: z.enum(['manual', 'agent']).nullable(),
    /** manifest apiVersion（vendor 件；builtin 恒 null）。 */
    version: z.number().int().nullable(),
    enabled: z.boolean(),
    /** active = 当前 world 在载；unloaded = 已装未载；disabled = 名单停用或 apiVersion 拒载。 */
    status: z.enum(['active', 'failed', 'disabled', 'unloaded']),
    /** status != active 的原因（apiVersion 不匹配等；文案按原因渲染）。 */
    disabledReason: z.string().nullable(),
    description: z.string().nullable(),
    path: z.string().nullable(),
  })
  .strict();
export type PluginView = z.infer<typeof PluginViewSchema>;

/** 插件候选视图（plugins/candidates；导入对话框数据源）。 */
export const PluginCandidateViewSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    /** 源插件目录绝对路径（plugin.json 的父目录）。 */
    sourcePath: z.string(),
    origin: z.enum(['picked', 'agent']),
    state: z.enum(['ready', 'rename', 'blocked']),
    /** blocked 诊断（自然语言——manifest/静态扫面无问题码闭集）；其余恒 null。 */
    problem: z.string().nullable(),
  })
  .strict();
export type PluginCandidateView = z.infer<typeof PluginCandidateViewSchema>;
export const PluginMethodsSchema = {
  /** 插件清单（builtin + vendor 合并视图）。 */
  'plugins/list': {
    params: empty,
    result: z.array(PluginViewSchema),
  },
  /** 插件候选扫描（导入对话框数据源）：sourcePath 必须在批准根之下。 */
  'plugins/candidates': {
    params: z.object({ sourcePath: z.string().min(1).optional() }).strict(),
    result: z.object({ candidates: z.array(PluginCandidateViewSchema) }).strict(),
  },
  /** 导入单个插件（经 hub plugins/install；结果为写后完整清单 + 热装编排）。 */
  'plugins/import': {
    params: z
      .object({
        sourcePath: z.string().min(1),
        overwrite: z.boolean().default(false),
        /** agent 源必带：已确认提案 id（hub 侧硬门消费） */
        proposalId: z.string().min(1).optional(),
      })
      .strict(),
    result: z
      .object({
        plugins: z.array(PluginViewSchema),
        imported: z.object({ name: z.string(), sha256: z.string() }).strict(),
      })
      .strict(),
  },
  /** 插件启停（写 hub plugins.disabled；builtin 与 vendor 同语义）。 */
  'plugins/setEnabled': {
    params: z.object({ name: z.string().min(1), enabled: z.boolean() }).strict(),
    result: z.array(PluginViewSchema),
  },
  /** 移除 vendor 件（hub plugins/remove；builtin 拒）。 */
  'plugins/remove': {
    params: z.object({ name: z.string().min(1) }).strict(),
    result: z.array(PluginViewSchema),
  },
  /** 热装（活跃 thread world 内即时装载）。 */
  'plugins/hotInstall': {
    params: z.object({ threadId: z.string().min(1), name: z.string().min(1) }).strict(),
    result: z.object({ name: z.string(), mode: z.string() }).strict(),
  },
  /** agent 提案面板（plugin_propose 登记态；确认走 hub trusted_source/confirm）。 */
  'plugins/proposals': {
    params: empty,
    result: z.object({
      proposals: z.array(PluginProposalRowSchema),
    }).strict(),
  },
  /** 确认提案（host 内存置位——文件伪造不可达；确认后 agent 链 install 可消费）。 */
  'plugins/confirmProposal': {
    params: z.object({ proposalId: z.string().min(1) }).strict(),
    result: z.null(),
  },
  /** 拒绝提案（确认态清除；登记保留至 TTL）。 */
  'plugins/rejectProposal': {
    params: z.object({ proposalId: z.string().min(1) }).strict(),
    result: z.null(),
  },
  /** 热卸（活跃 thread world 内即时卸载）。 */
  'plugins/hotUninstall': {
    params: z.object({ threadId: z.string().min(1), name: z.string().min(1), force: z.boolean().default(false) }).strict(),
    result: z.object({ name: z.string() }).strict(),
  },
} as const;
