import type { IdleRecycleMinutes, RuntimeSnapshotView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import type { WorkspaceActions } from '@/live/workspace-actions';
import { runtimeHealthLevel } from '@/screens/runtime-entries';
import type { RuntimeWorkerRow } from '@/screens/runtime-entries';
import { buildSummaryText, isRecyclableIdle } from '@/screens/runtime-format';
import { RuntimeDiagnostics } from '@/screens/runtime-diagnostics';
import { RuntimeHeader } from '@/screens/runtime-header';
import { RuntimeHostCard } from '@/screens/runtime-host-card';
import { RuntimeCapacityCard } from '@/screens/runtime-capacity-card';
import { RuntimeMemoryCard } from '@/screens/runtime-memory-card';
import { RuntimeTrendCard } from '@/screens/runtime-trend-card';
import { RuntimeWorkerTable } from '@/screens/runtime-worker-table';

/**
 * 运行状态页（T29）：健康灯页头 + 总览三卡（宿主/容量/内存）+ 资源走势 +
 * Worker 管理表 + 诊断区。数据由 use-runtime-panel 轮询装配；本组件只做展示分派
 * （快照未就绪的等待帧也完整可用——诊断区正是宿主不可用时的排障落点）。
 */

export type RuntimeScreenActions = Pick<
  WorkspaceActions,
  'stopThread' | 'retireSession' | 'forceRetireSession' | 'setKeepalive' | 'setIdleRecycle' | 'showNotice' | 'exportDiagnostics' | 'restartHost'
>;

type RuntimeScreenProps = {
  snapshot: RuntimeSnapshotView | null
  rows: readonly RuntimeWorkerRow[]
  diagnosticLog: string | null
  actions: RuntimeScreenActions
  onLoadDiagnosticLog: () => void
  onClose: () => void
  /** 打开会话：选中并回到会话视图（调用方负责收起本页）。 */
  onOpenSession: (threadId: string) => void
}

function RuntimeScreen({ snapshot, rows, diagnosticLog, actions, onLoadDiagnosticLog, onClose, onOpenSession }: RuntimeScreenProps) {
  const health = snapshot === null ? 'degraded' : runtimeHealthLevel(snapshot);
  const hostDown = snapshot !== null && (snapshot.hostPhase === null || snapshot.hostPhase === 'failed');
  const copySummary = (): void => {
    if (snapshot === null) return;
    void writeClipboardText(buildSummaryText(snapshot)).then((ok) => {
      actions.showNotice(ok ? copy.runtime.summaryCopied : copy.runtime.summaryCopyFailed);
    });
  };
  const exportDiagnostics = (): void => {
    void actions.exportDiagnostics().then((ok) => {
      if (ok) actions.showNotice(copy.runtime.exported);
    });
  };
  const recycleAllIdle = (): void => {
    for (const row of rows) {
      if (isRecyclableIdle(row)) void actions.retireSession(row.threadId);
    }
  };
  const setIdleRecycle = (minutes: IdleRecycleMinutes): void => {
    void actions.setIdleRecycle(minutes);
  };
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <RuntimeHeader health={health} onClose={onClose} />
      {hostDown ? (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/8">
          <p className="mx-auto max-w-[1060px] px-[28px] py-[8px] text-[11.5px] leading-[16px] text-destructive">
            {copy.runtime.hostUnavailable}
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-[12px] px-[28px] pt-[16px] pb-[40px]">
          {snapshot === null ? (
            <p className="py-[120px] text-center text-[12px] text-muted-foreground">{copy.runtime.emptyHistory}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-[10px]">
                <RuntimeHostCard snapshot={snapshot} />
                <RuntimeCapacityCard
                  threads={snapshot.hostInfo?.threads ?? null}
                  workerCount={snapshot.workers.length}
                  keepaliveCount={snapshot.workers.filter((worker) => worker.keepalive).length}
                  runningSubagents={snapshot.hostInfo?.subagents.running ?? 0}
                  limits={snapshot.hostInfo?.limits ?? null}
                />
                <RuntimeMemoryCard latest={snapshot.latest} />
              </div>
              <RuntimeTrendCard history={snapshot.history} />
              <RuntimeWorkerTable
                rows={rows}
                idleRecycleMinutes={snapshot.idleRecycleMinutes}
                onStop={(threadId) => actions.stopThread(threadId)}
                onRetire={(threadId) => void actions.retireSession(threadId)}
                onForceRetire={(threadId) => void actions.forceRetireSession(threadId)}
                onToggleKeepalive={(threadId, keepalive) => void actions.setKeepalive(threadId, keepalive)}
                onOpenSession={onOpenSession}
                onSetIdleRecycle={setIdleRecycle}
                onRecycleAllIdle={recycleAllIdle}
              />
              <RuntimeDiagnostics
                events={snapshot.events}
                diagnosticLog={diagnosticLog}
                onLoadDiagnosticLog={onLoadDiagnosticLog}
                onCopySummary={copySummary}
                onExportDiagnostics={exportDiagnostics}
                onRestartHost={() => actions.restartHost()}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { RuntimeScreen };
export type { RuntimeScreenProps };
