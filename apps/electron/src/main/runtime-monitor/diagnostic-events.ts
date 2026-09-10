import type { RuntimeEventView } from '@paiapp/contracts';

/**
 * 宿主监督字符串 → 结构化事件（create-host-process onDiagnostic 消息面的解析）。
 * 生产路径消息经 pai-runtime 以 `host:` 前缀包装落日志——解析前先剥前缀；
 * 前缀表与发射源（create-host-process note()）一一对应，前缀变更两侧同步。
 */

export function parseDiagnosticEvent(message: string, at: number = Date.now()): RuntimeEventView | null {
  const text = message.startsWith('host:') ? message.slice('host:'.length) : message;
  if (text.startsWith('restart:manual')) {
    // host.restart() 先记 manual 注记、restart() 随后记 cause= 注记——canonical
    // 是后者（含 attempt 计数），manual 前置注记去重为 null
    return null;
  }
  if (text.startsWith('restart:')) {
    const cause = text.split(':')[1] ?? '';
    return { at, level: 'warn', kind: 'host_restart', detail: cause };
  }
  if (text.startsWith('heartbeat stale')) {
    return { at, level: 'warn', kind: 'heartbeat_stale', detail: text };
  }
  if (text.startsWith('host_exit:')) {
    return { at, level: 'warn', kind: 'host_exit', detail: text.slice('host_exit:'.length) };
  }
  if (text.startsWith('frame_dropped:')) {
    return { at, level: 'warn', kind: 'frame_dropped', detail: text.slice('frame_dropped:'.length) };
  }
  if (text.startsWith('spawn_error:') || text.startsWith('spawn_failed:')) {
    return { at, level: 'error', kind: 'spawn_error', detail: text };
  }
  if (text.startsWith('set_idle_retire_failed:')) {
    return { at, level: 'warn', kind: 'policy_sync_failed', detail: text.slice('set_idle_retire_failed:'.length) };
  }
  return null;
}
