import type { ToolCallModel } from './thread-model';

/**
 * 工具单元详情区的展开与内容策略：
 * - 可展开 = 有详情可看（输出即详情；edit 的补丁片段也是详情——编辑类调用常常
 *   成功且无输出，只有片段才看得到「改了什么」）；
 * - 自动开合 = 只有失败自动展开（错误必须可见）；失败是终态，只开不关。
 *   运行中不自动展开：「开始输出即展开、成功即收起」的开合对会让短命令闪现
 *   输出面板；实时尾部由用户手动展开（CollapsePref 覆盖自动值，与轮级同一套
 *   resolveOpen 语义，手动意图跨终态保持）；
 * - 流式期间的详情只显示头部片段（命令回显与最早输出先到，用户盯的是结果面），
 *   结束态显示全量。
 */

const LIVE_HEAD_CHARS = 2000;

export function callExpandable(call: Pick<ToolCallModel, 'output' | 'editHunks'>): boolean {
  return call.output.length > 0 || call.editHunks.length > 0;
}

export function autoOpenForCall(call: Pick<ToolCallModel, 'status'>): boolean {
  return call.status === 'failed';
}

/** 并行组的自动开合：批次内任一调用失败即常开（错误必须在组级看得见），
 * 失败是终态，只开不关；其余批次默认收起，具体执行按需展开。 */
export function autoOpenForGroup(calls: readonly Pick<ToolCallModel, 'status'>[]): boolean {
  return calls.some((call) => call.status === 'failed');
}

export function detailOutput(call: Pick<ToolCallModel, 'status' | 'output'>): string {
  if (call.status !== 'running') return call.output;
  return call.output.length > LIVE_HEAD_CHARS ? call.output.slice(0, LIVE_HEAD_CHARS) : call.output;
}
