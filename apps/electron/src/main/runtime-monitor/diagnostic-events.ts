import type { RuntimeEventView } from '@paiapp/contracts';

/**
 * 宿主监督字符串 → 结构化事件（create-host-process onDiagnostic 消息面的解析）。
 * 前缀表与发射源（create-host-process note()）一一对应——前缀变更两侧同步。
 */

export function parseDiagnosticEvent(message: string, at: number = Date.now()): RuntimeEventView | null {
  if (message.startsWith('restart:')) {
    const cause = message.split(':')[1] ?? '';
    return { at, level: 'warn', kind: 'host_restart', detail: cause };
  }
  if (message.startsWith('heartbeat stale')) {
    return { at, level: 'warn', kind: 'heartbeat_stale', detail: message };
  }
  if (message.startsWith('host_exit:')) {
    return { at, level: 'warn', kind: 'host_exit', detail: message.slice('host_exit:'.length) };
  }
  if (message.startsWith('frame_dropped:')) {
    return { at, level: 'warn', kind: 'frame_dropped', detail: message.slice('frame_dropped:'.length) };
  }
  if (message.startsWith('spawn_error:') || message.startsWith('spawn_failed:')) {
    return { at, level: 'error', kind: 'spawn_error', detail: message };
  }
  return null;
}
