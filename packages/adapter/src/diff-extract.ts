import type { DiffFileView } from '@paiapp/contracts';

/**
 * 工具调用 → 文件变更视图。
 * edit：details.patch 是带文件头的统一 diff（--- path / +++ path）。
 * write：details 无 diff（基线不可得），从参数 content 行数计 additions、deletions 恒 0。
 * 其余工具返回 null。
 */

const FILE_MUTATING_TOOLS = new Set(['edit', 'write']);

export function isFileMutatingTool(name: string): boolean {
  return FILE_MUTATING_TOOLS.has(name);
}

/** edit 结果 details.patch → 变更视图；解析不出返回 null。 */
export function diffFromPatch(patch: unknown): DiffFileView | null {
  if (typeof patch !== 'string' || patch.length === 0) return null;
  let path = '';
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) {
      const header = line.slice(4).trim();
      if (header !== '/dev/null' && header.length > 0) path = stripPrefix(header);
      continue;
    }
    if (line.startsWith('--- ')) {
      if (path.length === 0) {
        const header = line.slice(4).trim();
        if (header !== '/dev/null') path = stripPrefix(header);
      }
      continue;
    }
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  if (path.length === 0) return null;
  return { path, additions, deletions };
}

function stripPrefix(header: string): string {
  if (header.startsWith('b/') || header.startsWith('a/')) return header.slice(2);
  return header.split('\t')[0] ?? header;
}

/** write 参数 → 变更视图（整文件重写：additions = 新内容行数）。 */
export function diffFromWriteArgs(args: Record<string, unknown>): DiffFileView | null {
  const path = args['path'];
  const content = args['content'];
  if (typeof path !== 'string' || path.length === 0 || typeof content !== 'string') return null;
  const additions = content.length === 0 ? 0 : content.split('\n').length;
  return { path, additions, deletions: 0 };
}

/** toolcall 级提取（执行前，从模型参数）：write 的变更在参数里已完备。 */
export function diffFromToolCall(name: string, args: Record<string, unknown>): DiffFileView[] | null {
  if (name === 'write') {
    const view = diffFromWriteArgs(args);
    return view === null ? null : [view];
  }
  return null;
}

/** tool_execution_end 级提取（执行后，从结果 details）。 */
export function diffFromToolResult(name: string, result: unknown): DiffFileView[] | null {
  if (name !== 'edit') return null;
  const details = typeof result === 'object' && result !== null ? (result as Record<string, unknown>)['details'] : undefined;
  if (typeof details !== 'object' || details === null) return null;
  const view = diffFromPatch((details as Record<string, unknown>)['patch']);
  return view === null ? null : [view];
}
