import type { GitBranchesView } from '@paiapp/contracts';

import { copy } from '@/strings';

/** 上下文条分支段呈现：文案 + 弱化态（加载中/失败/非仓库/游离 HEAD 一律弱化）。 */
export type BranchSegment = { label: string; title?: string; muted: boolean };

/**
 * 分支段单一真相：真实分支名取 git 真相，其余状态给本地化空形态文案。
 * failed 与 view=null 同支（调用方两者只可能同时成立），避免调用方各自拼文案。
 */
export function branchSegmentOf(view: GitBranchesView | null, loading: boolean, failed: boolean): BranchSegment {
  if (loading) return { label: copy.composer.branchLoading, muted: true };
  if (failed || view === null) return { label: copy.composer.branchUnavailable, muted: true };
  if (!view.isRepo) return { label: copy.composer.notARepo, muted: true };
  if (view.current === null) return { label: copy.composer.detachedHead, muted: true };
  return { label: view.current, muted: false };
}
