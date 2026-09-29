import { z } from 'zod';

/**
 * 本地 git 视图（分支面板与图谱共用；api.ts 迁出的叶子形状模块——
 * 单文件行数预算内保持内聚）。
 */

/** 分支被 linked worktree 占用的事实（列表禁用标注与占用文案的数据源）。 */
export const GitWorktreeRefSchema = z
  .object({
    /** null = detached HEAD 树（无分支占用，占位行数据面）。 */
    branch: z.string().min(1).nullable(),
    /** worktree 绝对路径（占用者——文案/跳转用）。 */
    path: z.string().min(1),
  })
  .strict();
export type GitWorktreeRef = z.infer<typeof GitWorktreeRefSchema>;

/** 会话级 worktree 条目（git/worktree/list 视图；清理确认框与占用行的数据源）。 */
export const WorktreeEntryViewSchema = z
  .object({
    path: z.string().min(1),
    /** null = detached HEAD。 */
    branch: z.string().min(1).nullable(),
    /** status --porcelain --ignored 空（含 untracked/ignored——口径钉死）；目录缺席 = 键省略。 */
    clean: z.boolean(),
    /** 收编门结果（merge-base --is-ancestor tip 被任一其他本地分支包含）；detached = HEAD sha 同判据。 */
    merged: z.boolean(),
    /** tip 不可达自其他本地分支的提交数（rev-list --count 含 merge 纯计数——确认框文案；判据是 merged 布尔，本数非判据）。 */
    unmergedCount: z.number().int().min(0).optional(),
    /** porcelain locked 透传（UI 前置禁用清理按钮）。 */
    locked: z.boolean().optional(),
    /** 目录缺席/登记失真（孤儿态呈现）。 */
    prunable: z.boolean().optional(),
  })
  .strict();
export type WorktreeEntryView = z.infer<typeof WorktreeEntryViewSchema>;

/** 本地 git 分支视图（两页分支面板共用）：非 git 目录 isRepo=false + 空列表（降级不报错）。
 *  gitDir/worktrees：主进程本地 watch 兜底锚（HEAD 所在——linked worktree 在主仓
 *  .git/worktrees/<n> 下）与占用表（docs/GIT-INTERACTION-REDESIGN §2.2）。 */
export const GitBranchesViewSchema = z
  .object({
    isRepo: z.boolean(),
    current: z.string().nullable(),
    branches: z.array(z.string()),
    /** 未提交更改的已跟踪文件数（与切换守卫同口径，不含未跟踪文件）。 */
    dirtyFiles: z.number().int().min(0),
    /** gitdir 绝对路径（非 git 目录键省略——zod optional）；分支菜单失效信号的 watch 锚。 */
    gitDir: z.string().min(1).optional(),
    /** linked worktree 占用表（无占用/非仓键省略）。 */
    worktrees: z.array(GitWorktreeRefSchema).optional(),
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
