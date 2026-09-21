import type { SubagentStatus } from '@/thread/thread-model';

import { copy } from '@/strings';

/** 子代理状态展示文案（ChildView status running|idle|stopped 三档 → 面板状态词）。 */
export function subagentStatusLabel(status: SubagentStatus): string {
  if (status === 'running') return copy.flow.subagentBusy;
  if (status === 'idle') return copy.flow.subagentIdle;
  return copy.flow.subagentArchived;
}
