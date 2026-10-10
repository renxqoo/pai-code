import type { X3codeCommand } from '@x3code/contracts';

/**
 * 命令编码：X3codeCommand + 关联 id → 单行 JSONL。
 * id 由宿主进程层生成（request 关联职责不在本模块）。
 */
export function encodeCommand(command: X3codeCommand, id: string): string {
  return `${JSON.stringify({ ...command, id })}\n`;
}
