import { createApiClient } from '@paiapp/api/client';
import type { ApiError, ApiOutcome } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';

/**
 * 工作区只读能力（项目文件搜索 / 本地 git 分支）：全部经主进程路由，
 * cwd 白名单与 git 子进程纪律都在主进程侧，本层只做空 cwd 的早退与结果透传。
 */

/** 空 cwd 早退的失败形态（与主进程目录门禁同 kind）。 */

const emptyCwd = (): { ok: false; error: ApiError } => ({ ok: false, error: { kind: 'cwd_not_allowed' } });

/** 项目文件搜索（@ 引用；失败返回 null，弹层按空结果呈现）。 */
export async function searchFiles(client: BridgeClient, cwd: string, query: string): Promise<string[] | null> {
  const api = createApiClient(client);
  if (cwd.length === 0) return null;
  const outcome = await api.files.search({ cwd, query });
  return outcome.ok ? outcome.data : null;
}

/** 本地 git 分支列表（非仓库为空形态；失败 {ok:false} 由调用方转文案）。 */
export async function listGitBranches(client: BridgeClient, cwd: string): Promise<ApiOutcome<'git/branches'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.branches({ cwd });
}

/** 本地 git 图谱（非仓库为空形态；失败 {ok:false} 由调用方转文案）。 */
export async function listGitGraph(client: BridgeClient, cwd: string): Promise<ApiOutcome<'git/graph'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.graph({ cwd });
}

/** 工作区变更速览（速览面板 Git 区；非仓库为空形态，失败 {ok:false}）。 */
export async function listGitStatus(client: BridgeClient, cwd: string): Promise<ApiOutcome<'git/status'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.status({ cwd });
}

/** 切换 / 创建并检出分支（失败原因透传，由调用方转文案）。 */
export async function checkoutGitBranch(
  client: BridgeClient,
  cwd: string,
  branch: string,
  create: boolean,
): Promise<ApiOutcome<'git/checkout'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.checkout({ cwd, branch, create });
}

/** 会话级 worktree 四动作（verb 语义见主进程 git-worktree.ts；结果透传由调用方转文案）。 */
export async function listWorktrees(client: BridgeClient, cwd: string): Promise<ApiOutcome<'git/worktree/list'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.worktreeList({ cwd });
}

export async function createWorktree(client: BridgeClient, cwd: string, branch: string, originThreadHint?: string | null): Promise<ApiOutcome<'git/worktree/create'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.worktreeCreate({ cwd, branch, ...(originThreadHint !== undefined && originThreadHint !== null && originThreadHint !== '' ? { originThreadHint } : {}) });
}

export async function removeWorktree(client: BridgeClient, cwd: string, path: string): Promise<ApiOutcome<'git/worktree/remove'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.worktreeRemove({ cwd, path });
}

export async function mergeWorktree(client: BridgeClient, cwd: string, branch: string): Promise<ApiOutcome<'git/worktree/merge'>> {
  const api = createApiClient(client);
  if (cwd.length === 0) return emptyCwd();
  return api.git.worktreeMerge({ cwd, branch });
}

/** 登记面三张表读口（侧栏归并/派生树 chip 数据源）。 */
export async function worktreeRegistry(client: BridgeClient): Promise<ApiOutcome<'git/worktree/registry'>> {
  const api = createApiClient(client);
  return api.git.worktreeRegistry({});
}
