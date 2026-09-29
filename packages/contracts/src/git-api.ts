import { z } from 'zod';
import { GitBranchesViewSchema, GitGraphViewSchema, GitStatusViewSchema, WorktreeEntryViewSchema } from './git-views';

/** 本地 git 族 verb schema（方法表的 git 域切片——分支面板与会话级 worktree 工作流）。 */
export const GitApiSchemas = {
  /** 会话级 worktree 族（create：用户区+锁+条件兜底 CAS；remove：四道门+CAS；
   *  merge：--no-ff+预检双门；list：占用行/确认框数据源。非 git 目录 list 空形态）。 */
  'git/worktree/list': {
    params: z.object({ cwd: z.string().min(1) }).strict(),
    result: z.object({ worktrees: z.array(WorktreeEntryViewSchema) }).strict(),
  },
  'git/worktree/create': {
    params: z.object({ cwd: z.string().min(1), branch: z.string().min(1), originThreadHint: z.string().min(1).optional() }).strict(),
    result: z.object({ path: z.string().min(1), branch: z.string().min(1) }).strict(),
  },
  'git/worktree/remove': {
    params: z.object({ cwd: z.string().min(1), path: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'git/worktree/merge': {
    params: z.object({ cwd: z.string().min(1), branch: z.string().min(1) }).strict(),
    result: z.object({ branch: z.string().min(1), merged: z.literal(true) }).strict(),
  },
  'git/branches': { /** 本地 git 分支列表；非 git 目录空形态不报错。 */
    params: z.object({ cwd: z.string().min(1) }).strict(),
    result: GitBranchesViewSchema,
  },
  'git/checkout': { /** 切换分支（create=创建并检出）；cwd 须已知目录，脏工作区拒。 */
    params: z.object({ cwd: z.string().min(1), branch: z.string().min(1), create: z.boolean().default(false) }).strict(),
    result: z.object({ branch: z.string() }).strict(),
  },
  'git/graph': { /** 本地 git 图谱：topo 序提交 + parents + 分支装饰；超限截断置 truncated。 */
    params: z.object({ cwd: z.string().min(1) }).strict(),
    result: GitGraphViewSchema,
  },
  'git/status': { /** 工作区变更速览：文件 + 增删行数 + 上游计数；非仓空形态。 */
    params: z.object({ cwd: z.string().min(1) }).strict(),
    result: GitStatusViewSchema,
  },
  /** 登记面三张表读口（侧栏归并/派生树 chip/徽标悬停数据源）。 */
  'git/worktree/registry': {
    params: z.object({}).strict(),
    result: z
      .object({
        dirs: z.array(z.string().min(1)),
        treeToRepoTop: z.record(z.string().min(1), z.string().min(1)),
        sessionTrees: z.record(z.string().min(1), z.string().min(1)),
      })
      .strict(),
  },
} as const;
