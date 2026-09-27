import type { EditCallRef, ToolStatusRef } from './tool-refs';

/**
 * 轮级变更摘要：成功改动的文件数（编辑类调用，按文件路径去重）。
 * 轮收起时挂在状态行旁——收起态也要看得到这轮动了哪些文件；
 * 无成功编辑返回 null（无变更可报，UI 不挂后缀）。
 *
 * **只收成功调用的补丁**：片段派生自工具入参（`tool/call` 一到就有了），
 * 与执行结果无关。不按 status 过滤，失败时会挂一份看起来改成功了的
 * 变更摘要——这里报的必须是「已改成的」，不是「想改的」。
 */
export function changedFileCount(calls: readonly (ToolStatusRef & EditCallRef)[]): number | null {
  const paths = new Set<string>();
  for (const call of calls) {
    if (call.status !== 'ok') continue;
    if (call.editHunks.length === 0) continue;
    for (const hunk of call.editHunks) {
      if (hunk.path.length > 0) paths.add(hunk.path);
    }
  }
  return paths.size > 0 ? paths.size : null;
}
