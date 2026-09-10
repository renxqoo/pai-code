import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

import type { RuntimeMonitor } from './runtime-monitor/create-runtime-monitor';
import type { PaiRuntime } from './pai-runtime';
import type { createFileSettings } from './file-settings';

/**
 * T29 运行状态路由族（app/runtime / 档位 / 回收三命令 / 诊断包）：
 * 从 api-routes 的 RouteTable 拆出（一动词一文件）；command/fail 由主表注入。
 */

type FileSettings = ReturnType<typeof createFileSettings>;

export interface RuntimeRoutesDeps {
  runtime: PaiRuntime;
  monitor: RuntimeMonitor;
  settings: FileSettings;
  command: (cmd: Parameters<PaiRuntime['host']['request']>[0], timeoutMs?: number) => Promise<{ ok: true; data: unknown } | { ok: false; reason: string }>;
  fail: (reason: string) => { ok: false; reason: string };
  exportDiagnosticsBundle: () => string;
}

export function runtimeRoutes(deps: RuntimeRoutesDeps): { [M in Extract<ApiMethod, 'app/runtime' | 'app/diagnosticLog' | 'app/setIdleRecycle' | 'app/exportDiagnostics' | 'session/retire' | 'session/forceRetire' | 'session/setKeepalive'>]: (params: ApiParams<M>) => Promise<ApiOutcome<M>> } {
  const { runtime, monitor, command, fail } = deps;
  return {
    'app/runtime': () => {
      // 纯内存快照读（轮询在监控器定时器内）；host 未构建时各字段安全降级
      return Promise.resolve({ ok: true as const, data: monitor.snapshot() });
    },
    'app/diagnosticLog': () => Promise.resolve({ ok: true as const, data: { stderrTail: runtime.hostStderrTail() } }),
    'app/setIdleRecycle': (params) => {
      // 档位唯一写路径：settings 持久（spawn env 一致性）+ set_idle_retire_ms 运行期生效
      deps.settings.patch({ idleRecycleMinutes: params.minutes });
      void command({ type: 'set_idle_retire_ms', ms: params.minutes * 60_000 }).catch(() => undefined);
      return Promise.resolve({ ok: true as const, data: { minutes: params.minutes } });
    },
    'app/exportDiagnostics': () => {
      try {
        return Promise.resolve({ ok: true as const, data: { directory: deps.exportDiagnosticsBundle() } });
      } catch {
        return Promise.resolve(fail('export_failed') as ApiOutcome<'app/exportDiagnostics'>);
      }
    },
    'session/retire': async (params) => {
      // 手动闲置收编：会话保留转 parked（视图经 thread_parked 事件回推折叠）
      const result = await command({ type: 'thread/retire', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/forceRetire': async (params) => {
      // 强制回收：清队列 + 停止当前轮（两条容错——未在途时失败不阻断）+ 收编
      await command({ type: 'clear_queue', threadId: params.threadId });
      await command({ type: 'abort', threadId: params.threadId });
      const result = await command({ type: 'thread/retire', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/setKeepalive': (params) => {
      const outcome = runtime.setSessionKeepalive(params.threadId, params.keepalive);
      return Promise.resolve(outcome === 'ok' ? { ok: true as const, data: null } : fail('unknown_session'));
    },
  };
}
