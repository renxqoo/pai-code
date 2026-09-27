/**
 * 单条执行行的文案派生：类型 + 状态 → 过去式/进行时前缀（「已阅读文件」「正在运行命令」）。
 * 状态写进动词而不是另起一个状态列——一行一个动词短语读下来就是「做过什么」。
 * 未知工具直呼工具名（不猜语义）；名称原样透出，不翻译。
 */

import { copy } from '@/strings';
import { toolKindOf, type ToolKind } from './tool-kind';
import type { ToolCallModel, ToolCallStatus } from './thread-model';

const DONE_BY_KIND: Readonly<Partial<Record<ToolKind, string>>> = {
  bash: copy.flow.rowDoneBash,
  read: copy.flow.rowDoneRead,
  edit: copy.flow.rowDoneEdit,
  write: copy.flow.rowDoneWrite,
  search: copy.flow.rowDoneSearch,
  list: copy.flow.rowDoneList,
  subagent: copy.flow.rowDoneSubagent,
};

const RUNNING_BY_KIND: Readonly<Partial<Record<ToolKind, string>>> = {
  bash: copy.flow.rowRunningBash,
  read: copy.flow.rowRunningRead,
  edit: copy.flow.rowRunningEdit,
  write: copy.flow.rowRunningWrite,
  search: copy.flow.rowRunningSearch,
  list: copy.flow.rowRunningList,
  subagent: copy.flow.rowRunningSubagent,
};

/**
 * 执行行前缀：运行中用进行时（未完成），成功用过去式。
 * **失败与停止各自成句**（「运行失败 bun test」而不是「已运行 bun test」+
 * 行尾一个红字退出码）——一列执行行里失败的那条必须一眼能找到，
 * 只靠行尾颜色扫不出来。
 * 未知工具直呼原名。垃圾输入（空工具名）降级为空串，不显悬空前缀。
 */
export function toolRowLabel(name: string, status: ToolCallStatus): string {
  const kind = toolKindOf(name);
  const trimmed = name.trim();
  if (kind === 'other') {
    if (trimmed.length === 0) return '';
    if (status === 'running') return copy.flow.rowRunningOther(trimmed);
    if (status === 'failed') return copy.flow.rowFailedOther(trimmed);
    if (status === 'stopped') return copy.flow.rowStoppedOther(trimmed);
    return copy.flow.rowDoneOther(trimmed);
  }
  if (status === 'failed') return copy.flow.rowFailed;
  if (status === 'stopped') return copy.flow.rowStopped;
  const table = status === 'running' ? RUNNING_BY_KIND : DONE_BY_KIND;
  return table[kind] ?? '';
}

/** 执行行前缀（取自调用本体：类型 + 状态）。 */
export function toolRowLabelOf(call: Pick<ToolCallModel, 'name' | 'status'>): string {
  return toolRowLabel(call.name, call.status);
}
