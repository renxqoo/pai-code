import type { ToolCallModel } from './thread-model';

/**
 * 工具单元详情区的展开与内容策略：
 * - 可展开 = 有输出（输出即详情；参数摘要常驻行内，退出状态常驻行尾）；
 * - 自动开合 = 运行中一旦有流式输出就展开看尾部，成功结束收起，失败保持展开（错误必须可见）；
 *   手动意图经 CollapsePref 覆盖自动值（与轮级开关同一套 resolveOpen 语义）；
 * - 流式期间的详情只显示尾部片段（增长中的输出头部无信息量），结束态显示全量。
 */

const LIVE_TAIL_CHARS = 2000;

export function callExpandable(call: Pick<ToolCallModel, 'output'>): boolean {
  return call.output.length > 0;
}

export function autoOpenForCall(call: Pick<ToolCallModel, 'status' | 'output'>): boolean {
  if (call.status === 'running') return call.output.length > 0;
  return call.status === 'failed';
}

export function detailOutput(call: Pick<ToolCallModel, 'status' | 'output'>): string {
  if (call.status !== 'running') return call.output;
  return call.output.length > LIVE_TAIL_CHARS ? call.output.slice(-LIVE_TAIL_CHARS) : call.output;
}
