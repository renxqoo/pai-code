import React from 'react';

import type { RuntimeSnapshotView, SessionStatsView, SessionView } from '@paiapp/contracts';

import { buildRuntimeRows, type RuntimeWorkerRow } from '@/screens/runtime-entries';
import type { WorkspaceActions } from '@/live/workspace-actions';

/**
 * 运行状态面板（T29/T30）：受控 open（设置 runtime 分区激活）期间 2s 轮询快照
 * （切走/关设置即停）+ worker 行装配。快照不进 store（单页消费，useState 持有）。
 */

const POLL_INTERVAL_MS = 2_000;

export interface RuntimePanelView {
  sessions: Readonly<Record<string, SessionView>>;
  statsById: Readonly<Record<string, SessionStatsView>>;
  /** 排队深度（steering + followUp；live 会话外的值无意义）。 */
  queueCountOf: (threadId: string) => number;
}

export interface RuntimePanel {
  snapshot: RuntimeSnapshotView | null;
  /** 最近一次拉取失败（快照 null 时区分「采集中」与「拉取失败」——静默等待帧会掩盖主进程/IPC 断链）。 */
  fetchFailed: boolean;
  rows: readonly RuntimeWorkerRow[];
  diagnosticLog: string | null;
  loadDiagnosticLog: () => void;
}

export function useRuntimePanel(actions: Pick<WorkspaceActions, 'fetchRuntime' | 'fetchDiagnosticLog'>, view: RuntimePanelView, open: boolean): RuntimePanel {
  const [snapshot, setSnapshot] = React.useState<RuntimeSnapshotView | null>(null);
  const [fetchFailed, setFetchFailed] = React.useState(false);
  const [diagnosticLog, setDiagnosticLog] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = (): void => {
      void actions.fetchRuntime().then((next) => {
        if (cancelled) return;
        if (next !== null) {
          setSnapshot(next);
          setFetchFailed(false);
        } else {
          setFetchFailed(true);
        }
      });
    };
    tick();
    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [open, actions]);

  const rows = React.useMemo(
    () =>
      snapshot === null
        ? []
        : buildRuntimeRows({
            workers: snapshot.workers,
            sessions: view.sessions,
            statsById: view.statsById,
            queueCountOf: view.queueCountOf,
            idleRetireMs: snapshot.hostInfo?.limits.idleRetireMs ?? null,
          }),
    [snapshot, view.sessions, view.statsById, view.queueCountOf],
  );

  const loadDiagnosticLog = React.useCallback(() => {
    void actions.fetchDiagnosticLog().then((log) => setDiagnosticLog(log));
  }, [actions]);

  return {
    snapshot,
    fetchFailed,
    rows,
    diagnosticLog,
    loadDiagnosticLog,
  };
}
