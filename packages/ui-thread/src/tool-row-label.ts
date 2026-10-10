/**
 * 单条执行行的文案派生：类型 + 状态 → 过去式/进行时前缀（「已阅读文件」「正在运行命令」）。
 * 状态写进动词而不是另起一个状态列——一行一个动词短语读下来就是「做过什么」。
 * 未知工具直呼工具名（不猜语义）；名称原样透出，不翻译。
 */

import type { ToolCopy } from './tool-copy';
import { toolKindOf, type ToolKind } from './tool-kind';
import type { ToolCallRef } from './tool-refs';
import type { ToolCallStatus } from '@x3code/contracts';

function doneByKind(copy: ToolCopy): Readonly<Partial<Record<ToolKind, string>>> {
  return {
    bash: copy.rowDoneBash,
    read: copy.rowDoneRead,
    edit: copy.rowDoneEdit,
    write: copy.rowDoneWrite,
    search: copy.rowDoneSearch,
    list: copy.rowDoneList,
    subagent: copy.rowDoneSubagent,
  };
}

function runningByKind(copy: ToolCopy): Readonly<Partial<Record<ToolKind, string>>> {
  return {
    bash: copy.rowRunningBash,
    read: copy.rowRunningRead,
    edit: copy.rowRunningEdit,
    write: copy.rowRunningWrite,
    search: copy.rowRunningSearch,
    list: copy.rowRunningList,
    subagent: copy.rowRunningSubagent,
  };
}

/**
 * 执行行前缀：运行中用进行时（未完成），成功用过去式。
 * **失败与停止各自成句**（「运行失败 bun test」而不是「已运行 bun test」+
 * 行尾一个红字退出码）——一列执行行里失败的那条必须一眼能找到，
 * 只靠行尾颜色扫不出来。
 * 未知工具直呼原名。垃圾输入（空工具名）降级为空串，不显悬空前缀。
 */
export function toolRowLabel(name: string, status: ToolCallStatus, copy: ToolCopy): string {
  const kind = toolKindOf(name);
  const trimmed = name.trim();
  if (kind === 'other') {
    if (trimmed.length === 0) return '';
    if (status === 'running') return copy.rowRunningOther(trimmed);
    if (status === 'failed') return copy.rowFailedOther(trimmed);
    if (status === 'stopped') return copy.rowStoppedOther(trimmed);
    return copy.rowDoneOther(trimmed);
  }
  if (status === 'failed') return copy.rowFailed;
  if (status === 'stopped') return copy.rowStopped;
  const table = status === 'running' ? runningByKind(copy) : doneByKind(copy);
  return table[kind] ?? '';
}

/** 执行行前缀（取自调用本体：类型 + 状态）。 */
export function toolRowLabelOf(call: ToolCallRef, copy: ToolCopy): string {
  return toolRowLabel(call.name, call.status, copy);
}
