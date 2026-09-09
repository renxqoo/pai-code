import type { ApiOutcome } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';

/**
 * 工作区只读能力（项目文件搜索 / 本地 git 分支）：全部经主进程路由，
 * cwd 白名单与 git 子进程纪律都在主进程侧，本层只做空 cwd 的早退与结果透传。
 */

/** 项目文件搜索（@ 引用；失败返回 null，弹层按空结果呈现）。 */
export async function searchFiles(client: BridgeClient, cwd: string, query: string): Promise<string[] | null> {
  if (cwd.length === 0) return null;
  const outcome = await client.invoke('file/search', { cwd, query });
  return outcome.ok ? outcome.data : null;
}

/** 本地 git 分支列表（非仓库为空形态；失败 {ok:false} 由调用方转文案）。 */
export async function listGitBranches(client: BridgeClient, cwd: string): Promise<ApiOutcome<'git/branches'>> {
  if (cwd.length === 0) return { ok: false, reason: 'cwd_not_allowed' };
  return client.invoke('git/branches', { cwd });
}

/** 切换 / 创建并检出分支（失败原因透传，由调用方转文案）。 */
export async function checkoutGitBranch(
  client: BridgeClient,
  cwd: string,
  branch: string,
  create: boolean,
): Promise<ApiOutcome<'git/checkout'>> {
  if (cwd.length === 0) return { ok: false, reason: 'cwd_not_allowed' };
  return client.invoke('git/checkout', { cwd, branch, create });
}
