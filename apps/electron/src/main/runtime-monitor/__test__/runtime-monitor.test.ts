import { describe, expect, test } from 'bun:test';

import type {
  HostCommandOutcome,
  HostDiagnostics,
  HostPhase,
  HostProcessPort,
  PaiCommand,
  ResourceSampleView,
  WorkerRowView,
} from '@paiapp/contracts';

import { parseDiagnosticEvent } from '../diagnostic-events';
import { createRuntimeMonitor, type RuntimeMonitorDeps } from '../create-runtime-monitor';

/**
 * 运行状态监控器（T29）：轮询折叠、快照装配、心跳资源、监督事件、host 降级。
 */

const HOST_INFO_DATA = {
  version: '0.13.0',
  piVersion: '0.85.1',
  bunVersion: '1.4.2',
  pid: 4321,
  uptimeMs: 120_000,
  rssBytes: 200 * 1024 * 1024,
  threads: { live: 1, parked: 2, dead: 0 },
  subagents: { running: 1 },
  limits: { maxThreads: 32, idleRetireMs: 300_000, workerStaleMs: 30_000, workerExitTimeoutMs: 10_000, maxSubagents: 8, bashTimeoutMs: 600_000 },
  backend: { id: 'pi-coding-agent', version: '0.85.1', capabilities: ['session.fork'] },
};

const THREAD_LIST_DATA = {
  threads: [
    { threadId: 't1', cwd: '/w/a', sessionPath: '/w/a/s.jsonl', isStreaming: true, state: 'live', idleMs: 0, subagents: 2, rssBytes: 111, keepalive: false },
    { threadId: 't2', cwd: '/w/b', sessionPath: '/w/b/s.jsonl', isStreaming: false, state: 'parked', idleMs: 0, subagents: 0, rssBytes: null, keepalive: true },
  ],
};

function makePort(overrides: Partial<Record<PaiCommand['type'], HostCommandOutcome>> = {}): HostProcessPort {
  return {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand) => {
      const outcome =
        command.type === 'get_host_info' ? overrides['get_host_info'] ?? { ok: true as const, data: HOST_INFO_DATA }
        : command.type === 'thread/list' ? overrides['thread/list'] ?? { ok: true as const, data: THREAD_LIST_DATA }
        : { ok: false as const, error: 'unhandled' };
      return Promise.resolve(outcome);
    },
    onFrame: () => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(undefined),
    dispose: () => Promise.resolve(undefined),
    diagnostics: (): HostDiagnostics => ({ stderrTail: 'tail', restartCount: 1, lastRestartCause: 'hang', lastRestartAt: 123 }),
  };
}

function makeDeps(host: HostProcessPort | null, polled: WorkerRowView[] = []): RuntimeMonitorDeps {
  return {
    host: () => host,
    appMetrics: () => ({ rssBytes: 100, cpuPercent: 1.5 }),
    systemMemory: () => ({ totalBytes: 1000, availableBytes: 400 }),
    idleRecycleMinutes: () => 5,
    appVersion: () => '1.2.3',
    onWorkersPolled: (rows) => {
      polled.length = 0;
      polled.push(...rows);
    },
  };
}

describe('parseDiagnosticEvent（监督字符串 → 事件）', () => {
  test('前缀表逐项', () => {
    expect(parseDiagnosticEvent('restart:cause=hang:attempt=2', 5)).toMatchObject({ at: 5, kind: 'host_restart', level: 'warn', detail: 'cause=hang' });
    expect(parseDiagnosticEvent('restart:manual:providers_changed', 5)).toMatchObject({ kind: 'host_restart', detail: 'manual' });
    expect(parseDiagnosticEvent('heartbeat stale >10000ms; restarting host', 5)).toMatchObject({ kind: 'heartbeat_stale', level: 'warn' });
    expect(parseDiagnosticEvent('host_exit:code=1:signal=null', 5)).toMatchObject({ kind: 'host_exit', detail: 'code=1:signal=null' });
    expect(parseDiagnosticEvent('frame_dropped:line_not_json', 5)).toMatchObject({ kind: 'frame_dropped' });
    expect(parseDiagnosticEvent('spawn_error:boom', 5)).toMatchObject({ kind: 'spawn_error', level: 'error' });
    expect(parseDiagnosticEvent('spawn_failed:boom', 5)).toMatchObject({ kind: 'spawn_error' });
    expect(parseDiagnosticEvent('host_phase:ready', 5)).toBeNull();
    expect(parseDiagnosticEvent('随便什么', 5)).toBeNull();
  });
});

describe('createRuntimeMonitor', () => {
  test('poll 折叠 host_info + thread/list 并推样本；快照全字段', async () => {
    const polled: WorkerRowView[] = [];
    const monitor = createRuntimeMonitor(makeDeps(makePort(), polled));
    await monitor.poll();
    expect(polled.length).toBe(2);
    const snapshot = monitor.snapshot();
    expect(snapshot.hostPhase).toBe('ready');
    expect(snapshot.hostInfo?.threads).toEqual({ live: 1, parked: 2, dead: 0 });
    expect(snapshot.workers.length).toBe(2);
    expect(snapshot.workers[1]?.keepalive).toBe(true);
    expect(snapshot.restarts).toEqual({ count: 1, lastCause: 'hang', lastAt: 123 });
    expect(snapshot.idleRecycleMinutes).toBe(5);
    expect(snapshot.appVersion).toBe('1.2.3');
    const latest = snapshot.latest as ResourceSampleView;
    expect(latest.appRssBytes).toBe(100);
    // 心跳尚未到达：hub rss 回落 get_host_info 的 rssBytes
    expect(latest.hubRssBytes).toBe(HOST_INFO_DATA.rssBytes);
    expect(latest.hubCpuPercent).toBeNull();
    // workers rss 聚合（111 + null→0）
    expect(latest.workersRssBytes).toBe(111);
    expect(latest.systemTotalBytes).toBe(1000);
  });

  test('心跳资源优先于轮询兜底；heartbeatAgeMs 随之可用', async () => {
    const monitor = createRuntimeMonitor(makeDeps(makePort()));
    monitor.noteHeartbeat({ type: 'heartbeat', rssBytes: 42, cpuPercent: 3.25 });
    await monitor.poll();
    const latest = monitor.snapshot().latest as ResourceSampleView;
    expect(latest.hubRssBytes).toBe(42);
    expect(latest.hubCpuPercent).toBe(3.25);
    expect(monitor.snapshot().heartbeatAgeMs).toBeGreaterThanOrEqual(0);
  });

  test('host 为 null 时 poll 零命令、快照安全降级', async () => {
    const monitor = createRuntimeMonitor(makeDeps(null));
    await monitor.poll();
    const snapshot = monitor.snapshot();
    expect(snapshot.hostPhase).toBeNull();
    expect(snapshot.hostInfo).toBeNull();
    expect(snapshot.workers).toEqual([]);
    expect(snapshot.restarts).toEqual({ count: 0, lastCause: null, lastAt: null });
  });

  test('轮询失败保留旧值（hub 挂死时快照仍可用）', async () => {
    const monitor = createRuntimeMonitor(makeDeps(makePort({ 'thread/list': { ok: false, error: 'timeout' } })));
    await monitor.poll();
    // thread/list 失败但 get_host_info 成功：workers 空（不误报漂移），hostInfo 仍新
    expect(monitor.snapshot().workers).toEqual([]);
    expect(monitor.snapshot().hostInfo?.uptimeMs).toBe(120_000);
  });

  test('监督事件：相位/诊断字符串/worker 生命周期进环且快照裁尾', () => {
    const monitor = createRuntimeMonitor({ ...makeDeps(makePort()), eventLimit: 200 });
    monitor.noteHostPhase('restarting');
    monitor.noteHostPhase('failed');
    monitor.noteDiagnostic('heartbeat stale >10000ms; restarting host');
    monitor.noteWorkerRecycled('t1', 'idle');
    monitor.noteWorkerDied('t2', 'worker exited');
    monitor.noteDiagnostic('unrecognized');
    const events = monitor.snapshot().events;
    expect(events.map((e) => e.kind)).toEqual(['host_phase', 'host_phase', 'heartbeat_stale', 'worker_recycled', 'worker_died']);
    expect(events[1]?.level).toBe('error');
  });

  test('history 降采样 ≤180 点且保最新', async () => {
    const monitor = createRuntimeMonitor({ ...makeDeps(makePort()), historyLimit: 900 });
    for (let index = 0; index < 400; index += 1) {
      monitor.noteHeartbeat({ type: 'heartbeat', rssBytes: index });
      await monitor.poll();
    }
    const history = monitor.snapshot().history;
    expect(history.length).toBeLessThanOrEqual(180);
    expect((history[history.length - 1] as ResourceSampleView).hubRssBytes).toBe(399);
  });
});
