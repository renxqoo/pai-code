import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError, settle } from '@paiapp/api';
import type { SessionCommands, SettingsCommands, ThreadCommands } from '@paiapp/api';

import { errorLogToken } from './error-log-token';

import type { RuntimeMonitor } from './runtime-monitor/create-runtime-monitor';
import type { PaiRuntime } from './pai-runtime';
import type { createFileSettings } from './file-settings';

/**
 * T29 运行状态路由族（app/runtime / 档位 / 回收三命令 / 诊断包）：
 * 从 api-routes 的 RouteTable 拆出（一动词一文件）；域 accessor 与 fail 由主表注入。
 */

type FileSettings = ReturnType<typeof createFileSettings>;

export interface RuntimeRoutesDeps {
  runtime: PaiRuntime;
  monitor: RuntimeMonitor;
  settings: FileSettings;
  /** 档位 hub 同步失败的落档钩子（装配层接监督日志 → 监控时间线）。 */
  onPolicySyncFailed?: (minutes: number, reason: string) => void;
  /** hub 域 accessor（惰性：路由构造早于 runtime.start；host 未启动时各路由显式降级）。 */
  settingsCommands: () => SettingsCommands;
  threadCommands: () => ThreadCommands;
  sessionCommands: () => SessionCommands;
  fail: (error: ApiError) => { ok: false; error: ApiError };
  exportDiagnosticsBundle: () => string;
}

export function runtimeRoutes(deps: RuntimeRoutesDeps): { [M in Extract<ApiMethod, 'app/runtime' | 'app/diagnosticLog' | 'app/setIdleRecycle' | 'app/exportDiagnostics' | 'session/retire' | 'session/forceRetire' | 'session/setKeepalive'>]: (params: ApiParams<M>) => Promise<ApiOutcome<M>> } {
  const { runtime, monitor, fail } = deps;
  return {
    'app/runtime': () => {
      // 纯内存快照读（轮询在监控器定时器内）；host 未构建时各字段安全降级
      return Promise.resolve({ ok: true as const, data: monitor.snapshot() });
    },
    'app/diagnosticLog': () => Promise.resolve({ ok: true as const, data: { stderrTail: runtime.hostStderrTail() } }),
    'app/setIdleRecycle': async (params) => {
      // 档位唯一写路径：settings 持久（spawn env 一致性）+ set_idle_retire_ms 运行期生效。
      // hub 命令失败时 settings 已落（下次宿主重启 env 生效）——半成功不静默：
      // 记监督事件（监控页时间线可见 effective 值滞后）
      deps.settings.patch({ idleRecycleMinutes: params.minutes });
      const outcome = await deps.settingsCommands().setIdleRetireMs({ value: params.minutes * 60_000 });
      if (!outcome.ok) deps.onPolicySyncFailed?.(params.minutes, errorLogToken(outcome.error));
      return { ok: true as const, data: { minutes: params.minutes } };
    },
    'app/exportDiagnostics': () => {
      try {
        return Promise.resolve({ ok: true as const, data: { directory: deps.exportDiagnosticsBundle() } });
      } catch {
        return Promise.resolve(fail(appError('export_failed')) as ApiOutcome<'app/exportDiagnostics'>);
      }
    },
    // 纯转发（thread.retire 为 ack 命令：成功恒 null 视图）
    'session/retire': async (params) => settle(await deps.threadCommands().retire(params)),
    'session/forceRetire': async (params) => {
      // 强制回收：清队列 + 停止当前轮（两条容错——未在途时失败不阻断）+ 收编
      await deps.sessionCommands().clearQueue({ threadId: params.threadId });
      await deps.sessionCommands().abort({ threadId: params.threadId });
      const result = await deps.threadCommands().retire({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.error);
    },
    'session/setKeepalive': (params) => {
      const outcome = runtime.setSessionKeepalive(params.threadId, params.keepalive);
      return Promise.resolve(outcome === 'ok' ? { ok: true as const, data: null } : fail(appError('unknown_session')));
    },
  };
}
