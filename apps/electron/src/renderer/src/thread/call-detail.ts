import type { ToolCallModel } from './thread-model';

/**
 * 工具单元详情区的展开与内容策略：
 * - 可展开 = 行详情里有东西可看。**只看 output**：edit 的补丁已迁到批次级
 *   FileDiffSection（同一文件多次编辑合成一个 diff），行详情里只剩输出。
 *   把 editHunks 计入会让「成功的 edit」变成死开关——有箭头、点了空白。
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

/**
 * 并行组的自动开合，对齐轮级口径（`autoOpenForTurn`：运行中实时展开、
 * 异常结束保持展开、正常完成收起为摘要）：
 * - **运行中常开**：用户最想盯的就是运行期，收起态只剩「运行了命令」五个字，
 *   命令内容与「已…」前缀全不渲染——信息量最低的时刻恰恰是眼睛最盯着的时候。
 *   同批次的单调用形态本来就是直出行（内容可见），并行却关着，两种形态不一致。
 * - **失败常开**：错误必须在组级看得见。失败是终态，只开不关。
 * - 正常完成才收起：让用户按需展开具体执行。
 */
export function autoOpenForGroup(calls: readonly Pick<ToolCallModel, 'status'>[]): boolean {
  return calls.some((call) => call.status === 'failed' || call.status === 'running');
}

export function detailOutput(call: Pick<ToolCallModel, 'status' | 'output'>): string {
  if (call.status !== 'running') return call.output;
  return call.output.length > LIVE_HEAD_CHARS ? call.output.slice(0, LIVE_HEAD_CHARS) : call.output;
}
