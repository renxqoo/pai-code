import type { ApiOutcome } from '@paiapp/contracts';

import type { ComposerAttachment } from '@/composer/prompt-card';
import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';

/** 新建任务提交面（渲染层内部形状，图片载荷转换由接线层负责）。 */
export type NewTaskStart = {
  cwd: string
  /** 在独立 worktree 中开始：已建树路径（null = 直接在所选目录开始）。 */
  worktreePath: string | null
  trusted: boolean
  /** `provider/modelId` */
  model: string
  /** null = 不干预（hub 按 settings 缺省） */
  permissionMode: string | null
  /** 思考档（协议档位值；null = 跟随缺省） */
  thinkingLevel: string | null
  text: string
  attachments: readonly ComposerAttachment[]
};

export type StartTaskDeps = {
  /** start 失败的回滚（树必 clean 零提交，remove 门必过）。 */
  removeWorktree: (cwd: string, path: string) => Promise<ApiOutcome<'git/worktree/remove'>>
  onCreate: (input: NewTaskStart) => Promise<boolean>
  /** 回滚失败：通知条（孤儿树由「清理」双入口兜底）。 */
  onRollbackError: (message: string) => void
};

/**
 * 新建任务提交链（SESSION-WORKTREE-WORKFLOW §1.5 创建提交原子性）：会话出生在树里
 * （cwd = 树路径，弹窗开关已建树）；start 失败自动回滚 remove。resolve true = 会话已建
 * （调用方关页）。
 */
export async function startTask(input: NewTaskStart, deps: StartTaskDeps): Promise<boolean> {
  const started = await deps.onCreate(input);
  if (started) return true;
  if (input.worktreePath !== null) {
    const rolled = await deps.removeWorktree(input.worktreePath, input.worktreePath);
    if (!rolled.ok) deps.onRollbackError(copyOfError(rolled.error));
  }
  return false;
}

/**
 * 建树反馈文案（SESSION-WORKTREE-WORKFLOW §1.3 按入口分句）：无来源会话报「会话将在 <path>
 * 中开始」；有来源不在此报——busy/idle/deferred 分句走 worktreeNotice 事件，不重复报。
 */
export function worktreeStartFeedback(worktreePath: string, hasSource: boolean): string | null {
  return hasSource ? null : copy.branch.wtStartPending(worktreePath);
}
