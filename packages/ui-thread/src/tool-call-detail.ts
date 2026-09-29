import type { ToolDetailRef, ToolOutputRef, ToolStatusRef } from './tool-refs';

/**
 * 工具单元详情区的展开与内容策略（两端同一套产品裁决）：
 * - 可展开 = 行详情里有东西可看。**只看 output**：edit 的补丁在批次级
 *   文件 diff 区（同一文件多次编辑合成一个 diff），行详情里只剩输出。
 *   把 editHunks 计入会让「成功的 edit」变成死开关——有箭头、点了空白。
 * - 自动开合 = 只有失败自动展开（错误必须可见）；失败是终态，只开不关。
 *   运行中不自动展开：「开始输出即展开、成功即收起」的开合对会让短命令闪现
 *   输出面板；实时尾部由用户手动展开（手动意图覆盖自动值并跨终态保持）。
 * - 流式期间的详情只显示头部片段（命令回显与最早输出先到，用户盯的是结果面），
 *   结束态显示全量。
 */

const LIVE_HEAD_CHARS = 2000;

export function callExpandable(call: ToolOutputRef): boolean {
  return call.output.length > 0;
}

export function autoOpenForCall(call: ToolStatusRef): boolean {
  return call.status === 'failed';
}

/**
 * 并行组的自动开合 = 任一调用按调用级裁决自动展开（与 `autoOpenForCall` 同一套，
 * 组没有第二套口径）：
 * - **失败常开**：错误必须在组级看得见。失败是终态，只开不关。
 * - **运行中不自动展开**：「开始即展开、完成即收起」的开合对在快批次下就是
 *   合并时的先开后关闪现（展开窗口只有几帧）。实时尾部由用户手动展开
 *   （手动意图覆盖自动值并跨终态保持）。
 * - 正常完成才收起：让用户按需展开具体执行。
 */
export function autoOpenForGroup(calls: readonly ToolStatusRef[]): boolean {
  return calls.some((call) => autoOpenForCall(call));
}

export function detailOutput(call: ToolDetailRef): string {
  if (call.status !== 'running') return call.output;
  return call.output.length > LIVE_HEAD_CHARS ? call.output.slice(0, LIVE_HEAD_CHARS) : call.output;
}
