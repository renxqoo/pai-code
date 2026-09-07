import type { DiffSummaryModel, ThreadModel } from '@/thread/thread-model';

/**
 * 会话级 diff 聚合（纯函数）：把全部轮次里的 diff 块按文件路径合并，
 * 同文件多次变更累加增删；文件按首次出现顺序排列。供 Diff 面板展示唯一真相。
 */
export function collectThreadDiff(thread: Pick<ThreadModel, 'items'>): DiffSummaryModel {
  const byPath = new Map<string, { path: string; additions: number; deletions: number }>();
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const item of thread.items) {
    if (item.kind !== 'turn') continue;
    for (const block of item.turn.blocks) {
      if (block.kind !== 'diff') continue;
      for (const file of block.diff.files) {
        const merged = byPath.get(file.path);
        if (merged === undefined) {
          byPath.set(file.path, { path: file.path, additions: file.additions, deletions: file.deletions });
        } else {
          merged.additions += file.additions;
          merged.deletions += file.deletions;
        }
        totalAdditions += file.additions;
        totalDeletions += file.deletions;
      }
    }
  }

  const files = [...byPath.values()];
  return {
    changedFiles: files.length,
    additions: totalAdditions,
    deletions: totalDeletions,
    files,
  };
}
