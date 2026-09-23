import type { ToolCallModel } from './thread-model';

/**
 * 工具单元详情区的展开与内容策略：
 * - 可展开 = 有输出（输出即详情；参数摘要常驻行内，退出状态常驻行尾）；
 * - 自动开合 = 只有失败自动展开（错误必须可见）；失败是终态，只开不关。
 *   运行中不自动展开：「开始输出即展开、成功即收起」的开合对会让短命令闪现
 *   输出面板；实时尾部由用户手动展开（CollapsePref 覆盖自动值，与轮级同一套
 *   resolveOpen 语义，手动意图跨终态保持）；
 * - 流式期间的详情只显示头部片段（命令回显与最早输出先到，用户盯的是结果面），
 *   结束态显示全量。
 */

const LIVE_HEAD_CHARS = 2000;

export function callExpandable(call: Pick<ToolCallModel, 'output'>): boolean {
  return call.output.length > 0;
}

export function autoOpenForCall(call: Pick<ToolCallModel, 'status'>): boolean {
  return call.status === 'failed';
}

export function detailOutput(call: Pick<ToolCallModel, 'status' | 'output'>): string {
  if (call.status !== 'running') return call.output;
  return call.output.length > LIVE_HEAD_CHARS ? call.output.slice(0, LIVE_HEAD_CHARS) : call.output;
}
