import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RuntimeEventView, RuntimeSnapshotView } from '@paiapp/contracts';

/**
 * 诊断包导出（T29）：userData/diagnostics/<ts>/ 目录——summary.md + 事件/快照
 * JSON + stderr 尾部 + 主日志副本。不打包 zip（零依赖）；Finder 定位由调用方 reveal。
 * 内容只含数字/版本/路径与 stderr（hub 协议承诺无凭据；provider key 永不入内）。
 */

export interface DiagnosticsBundleInput {
  snapshot: RuntimeSnapshotView;
  events: readonly RuntimeEventView[];
  stderrTail: string;
  /** 主日志文件路径；null/缺失 = 跳过副本。 */
  logFile: string | null;
}

export function writeDiagnosticsBundle(rootDir: string, input: DiagnosticsBundleInput, now: number = Date.now()): string {
  const directory = join(rootDir, `pai-diagnostics-${new Date(now).toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'snapshot.json'), JSON.stringify(input.snapshot, null, 2));
  writeFileSync(join(directory, 'events.json'), JSON.stringify(input.events, null, 2));
  writeFileSync(join(directory, 'stderr.txt'), input.stderrTail);
  writeFileSync(join(directory, 'summary.md'), renderSummary(input.snapshot));
  if (input.logFile !== null && existsSync(input.logFile)) {
    try {
      copyFileSync(input.logFile, join(directory, 'main.log'));
    } catch {
      // 日志副本失败不阻断导出（其余材料已落盘）
    }
  }
  return directory;
}

function renderSummary(snapshot: RuntimeSnapshotView): string {
  const info = snapshot.hostInfo;
  const threads = info?.threads;
  const latest = snapshot.latest;
  return [
    '# pai diagnostics',
    '',
    `- app version: ${snapshot.appVersion}`,
    `- host phase: ${snapshot.hostPhase ?? 'null'}`,
    `- host versions: hub ${info?.version ?? '-'} / bun ${info?.bunVersion ?? '-'}`,
    `- heartbeat age ms: ${snapshot.heartbeatAgeMs ?? '-'}`,
    `- restarts: ${snapshot.restarts.count} (last: ${snapshot.restarts.lastCause ?? '-'} at ${snapshot.restarts.lastAt ?? '-'})`,
    `- threads: live ${threads?.live ?? '-'} / parked ${threads?.parked ?? '-'} / dead ${threads?.dead ?? '-'}`,
    `- idle recycle minutes: ${snapshot.idleRecycleMinutes}`,
    `- app rss: ${fmtBytes(latest?.appRssBytes)} / hub rss: ${fmtBytes(latest?.hubRssBytes)} / workers rss: ${fmtBytes(latest?.workersRssBytes)}`,
    `- workers: ${snapshot.workers.length}`,
    '',
    '## workers',
    '',
    ...snapshot.workers.map(
      (row) =>
        `- ${row.threadId} [${row.state}] streaming=${row.isStreaming} idleMs=${row.idleMs} rss=${fmtBytes(row.rssBytes)} keepalive=${row.keepalive} cwd=${row.cwd}`,
    ),
  ].join('\n');
}

function fmtBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value / 1024)}KB`;
}
