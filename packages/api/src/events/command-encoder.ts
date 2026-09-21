import type { PaiCommand } from '@paiapp/contracts';

/**
 * 命令编码：PaiCommand + 关联 id → 单行 JSONL。
 * id 由宿主进程层生成（request 关联职责不在本模块）。
 */
export function encodeCommand(command: PaiCommand, id: string): string {
  return `${JSON.stringify({ ...command, id })}\n`;
}
