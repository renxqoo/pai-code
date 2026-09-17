import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeSnapshotView } from '@paiapp/contracts';

import { writeDiagnosticsBundle } from '../export-diagnostics';

describe('writeDiagnosticsBundle（诊断包导出）', () => {
  test('目录四件 + 日志副本 + 摘要可读（hub 版本行）', () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-export-'));
    try {
      const logFile = join(work, 'main.log');
      writeFileSync(logFile, 'line1\nline2\n');
      const snapshot: RuntimeSnapshotView = {
        hostPhase: 'ready',
        hostInfo: { version: '1.2.3', bunVersion: '1.4.2', pid: 7, uptimeMs: 9, rssBytes: 1, threads: { live: 1, parked: 0, dead: 0 }, limits: { maxThreads: 4, idleRetireMs: 1, workerStaleMs: 1, workerExitTimeoutMs: 1, rssRetireBytes: 1, bashTimeoutMs: 1 } },
        heartbeatAgeMs: 12,
        restarts: { count: 0, lastCause: null, lastAt: null },
        workers: [],
        latest: { at: 1, appRssBytes: 10, appCpuPercent: 1, hubRssBytes: null, hubCpuPercent: null, workersRssBytes: null, systemTotalBytes: null, systemAvailableBytes: null },
        history: [],
        events: [],
        idleRecycleMinutes: 5,
        appVersion: '0.0.0-test',
      };
      const directory = writeDiagnosticsBundle(join(work, 'diagnostics'), { snapshot, events: [], stderrTail: 'err tail', logFile }, 1_700_000_000_000);
      expect(existsSync(join(directory, 'summary.md'))).toBe(true);
      expect(existsSync(join(directory, 'snapshot.json'))).toBe(true);
      expect(existsSync(join(directory, 'events.json'))).toBe(true);
      expect(readFileSync(join(directory, 'stderr.txt'), 'utf8')).toBe('err tail');
      expect(existsSync(join(directory, 'main.log'))).toBe(true);
      const summary = readFileSync(join(directory, 'summary.md'), 'utf8');
      expect(summary).toContain('app version: 0.0.0-test');
      expect(summary).toContain('host phase: ready');
      expect(summary).toContain('hub 1.2.3 / bun 1.4.2');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test('日志缺失不阻断（副本跳过）', () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-export2-'));
    try {
      const directory = writeDiagnosticsBundle(work, {
        snapshot: {
          hostPhase: null,
          hostInfo: null,
          heartbeatAgeMs: null,
          restarts: { count: 0, lastCause: null, lastAt: null },
          workers: [],
          latest: null,
          history: [],
          events: [],
          idleRecycleMinutes: 15 as const,
          appVersion: 'x',
        },
        events: [],
        stderrTail: '',
        logFile: join(work, 'missing.log'),
      });
      expect(existsSync(join(directory, 'summary.md'))).toBe(true);
      expect(existsSync(join(directory, 'main.log'))).toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});


test('日志副本失败不阻断导出（copyFileSync 抛错走 catch）', () => {
  const work = mkdtempSync(join(tmpdir(), 'pai-export3-'));
  try {
    // 目录作 copyFileSync 源：读即抛 EISDIR → main.log 缺失但 summary 照常
    const directory = writeDiagnosticsBundle(work, {
      snapshot: {
        hostPhase: 'ready',
        hostInfo: null,
        heartbeatAgeMs: null,
        restarts: { count: 0, lastCause: null, lastAt: null },
        workers: [],
        latest: null,
        history: [],
        events: [],
        idleRecycleMinutes: 5 as const,
        appVersion: 'x',
      },
      events: [],
      stderrTail: '',
      logFile: work,
    });
    expect(existsSync(join(directory, 'summary.md'))).toBe(true);
    expect(existsSync(join(directory, 'main.log'))).toBe(false);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
