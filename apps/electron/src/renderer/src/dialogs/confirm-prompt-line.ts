import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';

/** 确认条信息行：主文案 + 悬停技术详情（空串 = 无详情，渲染方不设 title）。 */
export type ConfirmPromptLine = {
  readonly text: string;
  readonly hover: string;
};

/**
 * 信息行单源（统一工具提示文案）：主文案 = 「工具 + 目标」模板（目标 = summary：文件路径/
 * 命令——确认方一眼可见要动哪个文件）；裁决原因（reason）只进悬停技术详情，不再当主文案；
 * summary 缺席回退 reason 当目标（plugin_propose 等只有原因的确认面保留可读性）。
 */
export function confirmPromptLine(dialog: PendingDialog): ConfirmPromptLine | null {
  const tool = filled(dialog.tool);
  const summary = filled(dialog.summary);
  const reason = filled(dialog.reason);
  const target = summary ?? reason;
  const hover = [summary, reason].filter((value): value is string => value !== undefined).join('\n');
  if (tool !== undefined && target !== undefined) return { text: copy.dialogs.toolPrompt(tool, target), hover };
  if (target !== undefined) return { text: target, hover };
  if (tool !== undefined) return { text: tool, hover };
  return null;
}

/** 空串/缺省归一（确认条字段来自跨进程帧——垃圾值降级不渲染空壳）。 */
function filled(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}
