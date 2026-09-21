import type { DiffFileView } from '@paiapp/contracts';

/**
 * 工具调用 → 文件变更视图（x-harness 工具名：write——tool-write 包当前仅此一个
 * 文件写工具）。write：参数 {path, content} 完备（执行前已知），additions = 新内容
 * 行数。结果侧（tool/result）是纯文本 content，无 patch 面——diff 只在参数级提取。
 */

const FILE_MUTATING_TOOLS = new Set(['write']);


function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

/** write 参数 → 变更视图（整文件重写：additions = 新内容行数）。 */
export function diffFromWriteArgs(args: Record<string, unknown>): DiffFileView | null {
  const path = args['path'];
  const content = args['content'];
  if (typeof path !== 'string' || path.length === 0 || typeof content !== 'string') return null;
  return { path, additions: lineCount(content), deletions: 0 };
}

/** tool/call 级提取（执行前，从模型参数）：write 的变更在参数里已完备。 */
export function diffFromToolCall(name: string, args: Record<string, unknown>): DiffFileView[] | null {
  if (name !== 'write') return null;
  const view = diffFromWriteArgs(args);
  return view === null ? null : [view];
}
