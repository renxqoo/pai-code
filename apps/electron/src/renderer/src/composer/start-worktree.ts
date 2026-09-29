import type { ApiOutcome } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';

export type StartWorktreeInput = {
  cwd: string
  branch: string
  /** 来源会话（通告投递目标——busy/idle 反馈经 worktreeNotice 事件）；'' = 无来源 */
  originThreadId: string
};

export type StartWorktreeDeps = {
  createWorktree: (cwd: string, branch: string, originThreadId: string) => Promise<ApiOutcome<'git/worktree/create'>>
  /** 建树成功收尾（关弹窗 + bump 分支失效代次） */
  onCreated: () => void
};

/**
 * 「在独立 worktree 开始」确认动作（会话页/pulse 共用）：建树成功 → 收尾并返回 null；
 * 失败 → 返回弹窗内联原因（不关窗，改名重试）。返回形状与 useWorktreeStart 的确认动作同契约。
 */
export async function startWorktree(input: StartWorktreeInput, deps: StartWorktreeDeps): Promise<string | null> {
  try {
    const outcome = await deps.createWorktree(input.cwd, input.branch, input.originThreadId);
    if (!outcome.ok) return copyOfError(outcome.error);
    deps.onCreated();
    return null;
  } catch (reason) {
    // transport 拒发也走弹窗内联报因（不静默、不悬挂未处理拒绝）
    return String(reason);
  }
}
