import { isTodoTool, type HistoryItem, type TodoSnapshotEventData } from '@paiapp/contracts';

import { assistantText, assistantThinking, assistantToolCalls, flattenUserText, toolResultText, userImages } from './content';
import { previewArgs } from './args-preview';
import { diffFromWriteArgs } from './diff-extract';
import { isSnapshotFrame } from './snapshot-frame';
import { subagentsField } from './subagent-spawns';
import { todoSnapshotOf } from './todo-snapshot';

/**
 * get_entries 条目（x-harness WAL 投影 {seq, ts, event:{type, …data, surfaceOp?}}）→
 * HistoryItem[]（对话流的唯一真相源）。id = `seq-<seq>`（持久稳定，增量对账按 id 去重）；
 * messageTs = 行 ts。
 * 分组语义：tool/result 事件并入其 callId 所属的前一条 assistant 条目（tool/call
 * 与 assistant/message 的 tool_use 块同源——tool_use 已带完整参数，tool/call 到达时
 * 仅补齐尚未落 message 的调用面）；直执行 bash 以 user 消息信封
 * （`[bash] $ <cmd>\n<output>`）落 WAL，按前缀还原；user/message 域内的内核尾部
 * 快照信封帧（模型上下文而非对话内容，谓词见 snapshot-frame.ts）整帧跳过；
 * replace 型 user/message（compaction/autocompact L2 压缩摘要）归系统条
 * （origin=system）；todo 清单工具的 tool/call|result 与 assistant 条目内的对应
 * tool_use 不产生渲染条目（对话流零痕迹——面板进程区由 todo/snapshot 呈现）；
 * todo/snapshot 不产生渲染条目但被折为快照返回（last-wins，进程区数据源）；
 * 其余事件（turn/*、step/*、system/message、request/*、llm/retry、
 * agent/inbox/spliced、autocompact/*、session/meta、
 * session/end-seed、compaction/*、command/*）为元数据/账本域，不产生渲染条目
 * （cursor 仍推进——按行消费，不按渲染条目消费）。
 */

const BASH_ENVELOPE = '[bash] $ ';

/** assistant 条目的工具调用元素（tool/result 并入的目标形状）。 */
type AssistantToolCall = Extract<HistoryItem, { kind: 'assistant' }>['toolCalls'][number];

export function mapEntries(data: unknown): { items: HistoryItem[]; cursor: number | null; todo: TodoSnapshotEventData | null } {
  const list = Array.isArray((recordOf(data))['entries']) ? (recordOf(data)['entries'] as unknown[]) : [];
  const items: HistoryItem[] = [];
  // 条目 seq 记录（surfaceOp replace 区间折叠用——压缩摘要是位置区间替换，原始
  // WAL 事件仍在流里，水化必须剔除被替换区间否则历史双份，docs/COMPACTION.md §2.A）
  const seqOfItem = new Map<HistoryItem, number>();
  // callId → 最近一个 assistant HistoryItem 的 toolCalls 数组引用（tool/result 并入）
  const pendingTools = new Map<string, AssistantToolCall[]>();
  // tool/call 先于 assistant/message 到达时的暂存（name/args 补齐面）
  const earlyCalls = new Map<string, { name: string; args: Record<string, unknown> }>();
  let cursor: number | null = null;
  // 本窗口内最后一条 todo/snapshot（窗口内无快照 = null——调用方不得据此清既有快照）
  let todo: TodoSnapshotEventData | null = null;

  for (const raw of list) {
    const entry = recordOf(raw);
    const seq = entry['seq'];
    if (typeof seq !== 'number' || !Number.isFinite(seq)) continue;
    cursor = seq;
    const event = recordOf(entry['event']);
    const at = typeof entry['ts'] === 'number' ? entry['ts'] : 0;
    const id = `seq-${seq}`;
    const type = event['type'];

    if (type === 'user/message') {
      // 内核尾部快照信封帧（agent-types/date/project-instructions/技能清单）：模型上下文
      // 非对话内容，整帧跳过（cursor 已推进；与内核 isSnapshotNode 同谓词，kind 无关）
      if (isSnapshotFrame(event)) continue;
      const text = flattenUserText(event['content']);
      const bashItem = bashItemOf(id, at, text);
      // replace 型 user/message 是内核压缩摘要（compaction/autocompact L2 的区间落账）：
      // 历史的压缩形态而非用户发言，归系统条展示，不进用户气泡
      const origin: 'user' | 'system' = isReplaceOp(event['surfaceOp']) ? 'system' : 'user';
      const item = bashItem ?? { kind: 'user', id, text, origin, at, images: userImages(event['content']) } as HistoryItem;
      applySurfaceOp(items, seqOfItem, event['surfaceOp'], seq, item);
      pendingTools.clear();
      continue;
    }

    if (type === 'assistant/message') {
      const toolCallViews = assistantToolCalls(event['content']).map((call) => {
        const early = earlyCalls.get(call.id);
        const name = call.name.length > 0 ? call.name : (early?.name ?? '');
        const args = call.name.length > 0 && Object.keys(call.args).length > 0 ? call.args : (early?.args ?? call.args);
        return {
          id: call.id,
          name,
          argsPreview: previewArgs(args),
          output: '',
          isError: false,
          diff: name === 'write' ? writeDiffOf(args) : null,
          ...subagentsField(name, args),
        };
      }).filter((call) => !isTodoTool(call.name));
      // 异常终态收窄（内核词表 stop|max-tokens + interrupted 布尔）：max-tokens 透传，
      // interrupted（中止/打断）映射 aborted；失败信息在 turn/end reason（live 经
      // settled reason 呈现），消息级无 error 面——不再杜撰 meta.error 读取
      const rawStopReason = event['stopReason'];
      const interrupted = event['interrupted'] === true;
      const stopReason = rawStopReason === 'max-tokens' ? 'max-tokens' : interrupted ? 'aborted' : null;
      applySurfaceOp(items, seqOfItem, event['surfaceOp'], seq, {
        kind: 'assistant',
        id,
        at,
        messageTs: at,
        text: assistantText(event['content']),
        thinking: thinkingOf(event['thinking'], event['content']),
        toolCalls: toolCallViews,
        usage: usageOf(event['usage']),
        stopReason,
        errorMessage: null,
      });
      for (const call of toolCallViews) pendingTools.set(call.id, toolCallViews);
      continue;
    }

    if (type === 'tool/call') {
      const callId = str(event['callId']);
      const name = str(event['name']);
      const args = argsOfJson(event['arguments']);
      const target = pendingTools.get(callId);
      if (target !== undefined) {
        for (let index = 0; index < target.length; index += 1) {
          const call = target[index];
          if (call === undefined || call.id !== callId) continue;
          // 补面终名是 todo 工具 = 对话流零痕迹：整条移除（tool/result 天然失配丢弃）
          if (isTodoTool(name)) {
            target.splice(index, 1);
            break;
          }
          target[index] = {
            id: callId,
            name: name.length > 0 ? name : call.name,
            argsPreview: Object.keys(args).length > 0 ? previewArgs(args) : call.argsPreview,
            output: call.output,
            isError: call.isError,
            diff: name === 'write' ? writeDiffOf(args) : call.diff,
            ...(call.subagents !== undefined ? { subagents: call.subagents } : {}),
          };
          break;
        }
      } else {
        // todo 工具照记暂存（tool_use 块名为空时靠它在合并点判滤）
        earlyCalls.set(callId, { name, args });
      }
      continue;
    }

    if (type === 'tool/result') {
      // 并入所属 assistant 条目的同 callId 工具调用（原位更新）；找不到（异常序）则丢弃
      const callId = str(event['callId']);
      const target = pendingTools.get(callId);
      if (target === undefined) continue;
      for (let index = 0; index < target.length; index += 1) {
        const call = target[index];
        if (call === undefined || call.id !== callId) continue;
        target[index] = {
          id: callId,
          name: call.name,
          argsPreview: call.argsPreview,
          output: toolResultText(event['content']),
          isError: event['isError'] === true,
          // write 的 diff 来自参数（执行前已知），tool/result 无 diff 面不得清掉
          diff: call.diff,
          subagents: call.subagents,
        };
        break;
      }
      continue;
    }

    if (type === 'todo/snapshot') {
      // 清单全量快照 last-wins（垃圾形状跳过不跌零）
      const snapshot = todoSnapshotOf(event);
      if (snapshot !== null) todo = snapshot;
      continue;
    }

    // 其余事件类型：元数据/账本域，不产生渲染条目（cursor 已推进）
  }

  return { items, cursor, todo };
}

/** surfaceOp replace 判别：replace 型 user/message 的唯一产生者是内核压缩摘要落账
 *  （compaction/autocompact L2——与内核 findLastSummary 同款结构特征），按协议字段
 *  判别，非文本嗅探。 */
function isReplaceOp(surfaceOp: unknown): boolean {
  return recordOf(surfaceOp)['op'] === 'replace';
}

/** surfaceOp 应用（压缩区间折叠）：append 追加；replace 先剔除 [startSeq,endSeq]
 *  区间内已收集条目再追加携带摘要的本条——历史视图与 session.surface() 对齐。 */
function applySurfaceOp(
  items: HistoryItem[],
  seqOfItem: Map<HistoryItem, number>,
  surfaceOp: unknown,
  seq: number,
  item: HistoryItem,
): void {
  const op = recordOf(surfaceOp);
  const kind = op['op'];
  if (kind === 'replace') {
    const start = op['startSeq'];
    const end = op['endSeq'];
    if (typeof start === 'number' && typeof end === 'number') {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const existing = items[index];
        if (existing === undefined) continue;
        const existingSeq = seqOfItem.get(existing);
        if (existingSeq !== undefined && existingSeq >= start && existingSeq <= end) {
          items.splice(index, 1);
          seqOfItem.delete(existing);
        }
      }
    }
  }
  items.push(item);
  seqOfItem.set(item, seq);
}

/** 直执行 bash 信封还原：首行 `[bash] $ <cmd>`、其余为输出。 */
function bashItemOf(id: string, at: number, text: string): HistoryItem | null {
  if (!text.startsWith(BASH_ENVELOPE)) return null;
  const rest = text.slice(BASH_ENVELOPE.length);
  const newline = rest.indexOf('\n');
  const command = newline === -1 ? rest : rest.slice(0, newline);
  const output = newline === -1 ? '' : rest.slice(newline + 1);
  return { kind: 'bash', id, command, output, exitCode: 0, cancelled: false, at };
}

function writeDiffOf(args: Record<string, unknown>): { path: string; additions: number; deletions: number }[] | null {
  const view = diffFromWriteArgs(args);
  return view === null ? null : [view];
}

/** thinking 双载体：独立字段（WAL 权威）优先，content 块兜底。 */
function thinkingOf(field: unknown, content: unknown): string {
  if (typeof field === 'string' && field.length > 0) return field;
  return assistantThinking(content);
}

/** 内核 usage {input, output, …} → 视图 {input, output}。 */
function usageOf(usage: unknown): { input: number; output: number } | null {
  const u = recordOf(usage);
  const input = u['input'];
  const output = u['output'];
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

/** tool/call arguments（JSON 字符串）→ 宽容解析的参数对象。 */
function argsOfJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
