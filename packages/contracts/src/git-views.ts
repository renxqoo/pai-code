import { z } from 'zod';

/**
 * 本地 git 视图（分支面板与图谱共用；api.ts 迁出的叶子形状模块——
 * 单文件行数预算内保持内聚）。
 */

/** 本地 git 分支视图（两页分支面板共用）：非 git 目录 isRepo=false + 空列表（降级不报错）。 */
export const GitBranchesViewSchema = z
  .object({
    isRepo: z.boolean(),
    current: z.string().nullable(),
    branches: z.array(z.string()),
    /** 未提交更改的已跟踪文件数（与切换守卫同口径，不含未跟踪文件）。 */
    dirtyFiles: z.number().int().min(0),
  })
  .strict();
export type GitBranchesView = z.infer<typeof GitBranchesViewSchema>;

/** git status 单个变更文件（porcelain XY 归一到 kind；untracked 基线不可得，增删恒 0——与 DiffFileView 的 write 同规）。 */
export const GitStatusFileSchema = z
  .object({
    path: z.string(),
    kind: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
  })
  .strict();
export type GitStatusFile = z.infer<typeof GitStatusFileSchema>;

/** 工作区变更速览（速览面板 Git 区）：增删行数 = 已跟踪变更相对 HEAD（含 staged）；
 *  ahead/behind 相对上游（无上游/无 HEAD = 0）；files 超上限截断但计数全量。 */
export const GitStatusViewSchema = z
  .object({
    isRepo: z.boolean(),
    current: z.string().nullable(),
    files: z.array(GitStatusFileSchema),
    /** 变更文件总数（files 截断时仍为全量数）。 */
    fileCount: z.number().int().min(0),
    truncated: z.boolean(),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
    ahead: z.number().int().min(0),
    behind: z.number().int().min(0),
  })
  .strict();
export type GitStatusView = z.infer<typeof GitStatusViewSchema>;

/** git 图谱单条提交：parents 供渲染层计算泳道几何；refs 只含本地分支装饰（「HEAD -> main」形态原样透传，拆 pill 归渲染层）。 */
export const GitGraphCommitSchema = z
  .object({
    hash: z.string().min(1),
    shortHash: z.string().min(1),
    subject: z.string(),
    author: z.string(),
    /** 提交时间（epoch 秒）。 */
    timestamp: z.number().int().min(0),
    parents: z.array(z.string().min(1)),
    refs: z.array(z.string().min(1)),
    isHead: z.boolean(),
  })
  .strict();
export type GitGraphCommit = z.infer<typeof GitGraphCommitSchema>;

/** 本地 git 图谱视图：truncated = 提交数超展示上限被截断；空仓库 commits 为空数组。 */
export const GitGraphViewSchema = z
  .object({
    isRepo: z.boolean(),
    commits: z.array(GitGraphCommitSchema),
    truncated: z.boolean(),
  })
  .strict();
export type GitGraphView = z.infer<typeof GitGraphViewSchema>;
