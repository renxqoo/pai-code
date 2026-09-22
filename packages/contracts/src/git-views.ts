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
