import { createApiClient } from '@paiapp/api';
import type { InflightView, PendingDialogView, SubagentSnapshotView, ThreadStateView } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';

/**
 * 收敛读口（能力探测，T35 M2b）。
 *
 * hub 不支持的命令回 failure（恰好一响应，不挂起）；据此把该读口标记不可用并跳过后续调用，
 * 行为退化为既有路径。三条硬约束：
 * - **不得按版本号比较**——能力位是「后端能力面」，不是 hub 版本面；
 * - **探测只对 live 会话发起**——对非 live 线程的读由 hub 短路/直接失败，不唤醒（防御纵深）；
 * - **缓存属控制器实例**（不是模块级全局）：渲染层重载即新实例，宿主进程代际变化由
 *   `invalidate()` 清空重探；模块级全局会让测试与实例互相污染（曾导致一条回归用例假绿）。
 */
export interface ReadPorts {
  inflight(threadId: string): Promise<InflightView | null>;
  subagents(threadId: string): Promise<SubagentSnapshotView[] | null>;
  pendingDialogs(threadId: string): Promise<PendingDialogView[] | null>;
  /** 会话状态面（含排队镜像 queue）：失败即 null（既有路径下一拍重拉）。 */
  threadState(threadId: string): Promise<ThreadStateView | null>;
  /** 宿主进程代际变化（restarting/failed）→ 清空可用性缓存重探。 */
  invalidate(): void;
}

export function createReadPorts(client: BridgeClient): ReadPorts {
  const api = createApiClient(client);
  const unavailable = new Set<string>();
  const readPort = async <T>(
    method: 'session/inflight' | 'session/subagents' | 'session/pendingDialogs',
    threadId: string,
    pick: (data: unknown) => T,
  ): Promise<T | null> => {
    if (unavailable.has(method)) return null;
    const outcome = await client.invoke(method, { threadId }).catch(() => null);
    if (outcome === null) return null;
    if (!outcome.ok) {
      // 「不支持该命令」才缓存（老 hub）；瞬态失败只本次跳过，下次重试
      if (outcome.error.kind === 'unknown_command') unavailable.add(method);
      return null;
    }
    return pick(outcome.data);
  };

  return {
    inflight: (threadId) => readPort<InflightView>('session/inflight', threadId, (data) => data as InflightView),
    subagents: (threadId) => readPort<SubagentSnapshotView[]>('session/subagents', threadId, (data) => listOf<SubagentSnapshotView>(data, 'subagents')),
    pendingDialogs: (threadId) =>
      readPort<PendingDialogView[]>('session/pendingDialogs', threadId, (data) => listOf<PendingDialogView>(data, 'dialogs')),
    async threadState(threadId) {
      const outcome = await api.session.state({ threadId }).catch(() => null);
      return outcome?.ok === true ? (outcome.data as ThreadStateView) : null;
    },
    invalidate() {
      unavailable.clear();
    },
  };
}

/** 载荷形状兜底：缺字段/非数组一律空列表（垃圾输入回落空形态，不抛）。 */
function listOf<T>(data: unknown, key: 'subagents' | 'dialogs'): T[] {
  if (typeof data !== 'object' || data === null) return [];
  const list = (data as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list as T[]) : [];
}
