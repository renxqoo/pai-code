import type { DiffFileView } from '@paiapp/contracts';

/**
 * 工具调用 → 文件变更视图（内核工具名：edit_file / write_file）。
 * write_file：参数 {path, content} 完备（执行前已知），additions = 新内容行数。
 * edit_file：参数 {path, edits[{oldText,newText}]}，行数按各段 old/new 计
 * （转写重建无 details.patch——patch 只在实时事件通道；此处为计数近似、路径精确）。
 * 实时路径的 edit_file 结果 details.patch（统一 diff）走 diffFromPatch。
 */

const FILE_MUTATING_TOOLS = new Set(['edit_file', 'write_file']);

export function isFileMutatingTool(name: string): boolean {
  return FILE_MUTATING_TOOLS.has(name);
}

/** edit_file 结果 details.patch → 变更视图；解析不出返回 null。 */
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

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

/** write_file 参数 → 变更视图（整文件重写：additions = 新内容行数）。 */
export function diffFromWriteArgs(args: Record<string, unknown>): DiffFileView | null {
  const path = args['path'];
  const content = args['content'];
  if (typeof path !== 'string' || path.length === 0 || typeof content !== 'string') return null;
  return { path, additions: lineCount(content), deletions: 0 };
}

/** edit_file 参数 → 变更视图（各段行数合计的计数近似）。 */
export function diffFromEditArgs(args: Record<string, unknown>): DiffFileView | null {
  const path = args['path'];
  const edits = args['edits'];
  if (typeof path !== 'string' || path.length === 0 || !Array.isArray(edits)) return null;
  let additions = 0;
  let deletions = 0;
  for (const edit of edits) {
    if (typeof edit !== 'object' || edit === null) continue;
    const oldText = (edit as Record<string, unknown>)['oldText'];
    const newText = (edit as Record<string, unknown>)['newText'];
    if (typeof oldText === 'string') deletions += lineCount(oldText);
    if (typeof newText === 'string') additions += lineCount(newText);
  }
  return { path, additions, deletions };
}

/** tool/start 级提取（执行前，从模型参数）：write/edit 的变更在参数里已完备。 */
export function diffFromToolCall(name: string, args: Record<string, unknown>): DiffFileView[] | null {
  if (name === 'write_file') {
    const view = diffFromWriteArgs(args);
    return view === null ? null : [view];
  }
  if (name === 'edit_file') {
    const view = diffFromEditArgs(args);
    return view === null ? null : [view];
  }
  return null;
}

/** tool/result 级提取（执行后，从结果 details——仅实时事件通道携带）。 */
export function diffFromToolResult(name: string, result: unknown): DiffFileView[] | null {
  if (name !== 'edit_file') return null;
  const details = typeof result === 'object' && result !== null ? (result as Record<string, unknown>)['details'] : undefined;
  if (typeof details !== 'object' || details === null) return null;
  const view = diffFromPatch((details as Record<string, unknown>)['patch']);
  return view === null ? null : [view];
}
