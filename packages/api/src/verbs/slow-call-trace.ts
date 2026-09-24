import type { PaiCommand } from '@paiapp/contracts';

/**
 * 慢命令诊断行（「发送卡顿」类症状的定位口）：hub 命令成功路径不落常规日志，
 * 慢命令恰一行 `hub_call_slow:<type>:<threadId|->:<ms>ms`（与 hub_call_rejected
 * 同口径取 threadId 定位会话）；阈值由装配层注入（monitor 轮询豁免亦在装配层）。
 * null = 未达阈值不落。
 */
export function slowCallTrace(command: PaiCommand, durationMs: number, thresholdMs: number): string | null {
  if (durationMs < thresholdMs) return null;
  const threadId = (command as { threadId?: string }).threadId;
  return `hub_call_slow:${command.type}:${threadId ?? '-'}:${durationMs}ms`;
}
