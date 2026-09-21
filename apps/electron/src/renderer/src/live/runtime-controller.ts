import { createApiClient } from '@paiapp/api/client';
import type { IdleRecycleMinutes, RuntimeSnapshotView } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';

/**
 * 运行状态方法族（T29）：快照轮询 / 诊断日志 / 回收三命令 / 档位 / 诊断包导出。
 * 从 live-controller 拆出（一动词一文件）；成功返回数据或 null，失败返回 error kind。
 */

export interface RuntimeController {
  /** 运行状态快照（监控页 2s 轮询；host 未构建时字段安全降级）。 */
  readonly fetchRuntimeSnapshot: () => Promise<RuntimeSnapshotView | null>;
  /** 宿主 stderr 尾部（按需；失败 null）。 */
  readonly fetchDiagnosticLog: () => Promise<string | null>;
  /** 手动回收空闲 worker（成功 null，失败原因）。 */
  readonly retireSession: (threadId: string) => Promise<string | null>;
  /** 强制回收（清队列+停止+收编；成功 null，失败原因）。 */
  readonly forceRetireSession: (threadId: string) => Promise<string | null>;
  /** 常驻开关（成功 null）。 */
  readonly setKeepalive: (threadId: string, keepalive: boolean) => Promise<string | null>;
  /** 闲置回收档位（返回生效值；失败 null）。 */
  readonly setIdleRecycle: (minutes: IdleRecycleMinutes) => Promise<IdleRecycleMinutes | null>;
  /** 诊断包导出（返回目录；失败 null）。 */
  readonly exportDiagnostics: () => Promise<string | null>;
}

export function createRuntimeController(client: BridgeClient): RuntimeController {
  const api = createApiClient(client);
  return {
    async fetchRuntimeSnapshot(): Promise<RuntimeSnapshotView | null> {
      const outcome = await api.app.runtime({});
      return outcome.ok ? outcome.data : null;
    },
    async fetchDiagnosticLog(): Promise<string | null> {
      const outcome = await api.app.diagnosticLog({});
      // 传输层形状防御：data 异形降级空尾部（监控面不因垃圾载荷抛错）
      return outcome.ok ? (outcome.data?.stderrTail ?? '') : null;
    },
    async retireSession(threadId: string): Promise<string | null> {
      const outcome = await api.session.retire({ threadId });
      return outcome.ok ? null : outcome.error.kind;
    },
    async forceRetireSession(threadId: string): Promise<string | null> {
      const outcome = await api.session.forceRetire({ threadId });
      return outcome.ok ? null : outcome.error.kind;
    },
    async setKeepalive(threadId: string, keepalive: boolean): Promise<string | null> {
      const outcome = await api.session.setKeepalive({ threadId, keepalive });
      return outcome.ok ? null : outcome.error.kind;
    },
    async setIdleRecycle(minutes: IdleRecycleMinutes): Promise<IdleRecycleMinutes | null> {
      const outcome = await api.app.setIdleRecycle({ minutes });
      return outcome.ok ? outcome.data?.minutes ?? null : null;
    },
    async exportDiagnostics(): Promise<string | null> {
      const outcome = await api.app.exportDiagnostics({});
      return outcome.ok ? outcome.data?.directory ?? null : null;
    },
  };
}
