import { z } from 'zod';
import { GitBranchesViewSchema, GitGraphViewSchema, GitStatusViewSchema } from './git-views';

/** 本地 git 族 verb schema（方法表的 git 域切片——分支面板与图谱）。 */
export const GitApiSchemas = {
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
} as const;
