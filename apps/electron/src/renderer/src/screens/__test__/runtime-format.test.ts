import { describe, expect, test } from 'bun:test';

import type { ResourceSampleView, RuntimeSnapshotView } from '@paiapp/contracts';

import { copy } from '@/strings';

import {
  buildSummaryText,
  contextUsagePercent,
  formatBytes,
  formatGigabytes,
  formatMegabytes,
  formatUptime,
  heartbeatLabel,
  idleLabel,
  isRecyclableIdle,
  matchesWorkerFilter,
  phaseLabel,
  processMemorySegments,
  recycleCountdownLabel,
  systemMemoryPressure,
  toResourceChartPoints,
} from '../runtime-format';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe('formatBytes（字节展示）', () => {
  test('表驱动：KB/MB/GB 分档与非法输入降级', () => {
    const cases: ReadonlyArray<[number | null, string]> = [
      [null, '—'],
      [Number.NaN, '—'],
      [-1, '—'],
      [0, '1 KB'],
      [512, '1 KB'],
      [2 * 1024, '2 KB'],
      [MIB, '1.0 MB'],
      [1.5 * MIB, '1.5 MB'],
      [150 * MIB, '150 MB'],
      [2048 * MIB, '2.0 GB'],
    ];
    for (const [input, expected] of cases) expect(formatBytes(input)).toBe(expected);
  });
});

describe('formatUptime（运行时长）', () => {
  test('表驱动：秒/分/时/天与垃圾输入', () => {
    const cases: ReadonlyArray<[number | null, string]> = [
      [null, '0s'],
      [0, '0s'],
      [-5, '0s'],
      [59_000, '59s'],
      [61_000, '1m 1s'],
      [3_600_000, '1h 0m'],
      [3_600_000 + 120_000, '1h 2m'],
      [86_400_000 + 7_200_000, '1d 2h'],
    ];
    for (const [input, expected] of cases) expect(formatUptime(input)).toBe(expected);
  });
});

describe('数值刻度', () => {
  test('MB/GB 文本', () => {
    expect(formatMegabytes(852.4)).toBe('852 MB');
    expect(formatMegabytes(12.34)).toBe('12.3 MB');
    expect(formatMegabytes(Number.NaN)).toBe('0 MB');
    expect(formatGigabytes(9.4)).toBe('9.4 GB');
    expect(formatGigabytes(Number.NaN)).toBe('0 GB');
  });
});

describe('toResourceChartPoints（采样 → 图表点位）', () => {
  test('进程取 MB、系统取已用 GB；null 保持断点', () => {
    const sample = (overrides: Partial<ResourceSampleView>): ResourceSampleView => ({
      at: 1_000,
      appRssBytes: null,
      appCpuPercent: null,
      hubRssBytes: null,
      hubCpuPercent: null,
      workersRssBytes: null,
      systemTotalBytes: null,
      systemAvailableBytes: null,
      ...overrides,
    });
    const points = toResourceChartPoints([
      sample({ at: 1, appRssBytes: 128 * MIB, hubRssBytes: 64 * MIB, workersRssBytes: 256 * MIB, systemTotalBytes: 16 * GIB, systemAvailableBytes: 6 * GIB }),
      sample({ at: 2, workersRssBytes: 512 * MIB }),
    ]);
    expect(points[0]).toEqual({ at: 1, app: 128, hub: 64, workers: 256, system: 10 });
    expect(points[1]).toEqual({ at: 2, app: null, hub: null, workers: 512, system: null });
  });

  test('空历史 → 空点位', () => {
    expect(toResourceChartPoints([])).toEqual([]);
  });
});

describe('systemMemoryPressure / processMemorySegments', () => {
  const sample = (overrides: Partial<ResourceSampleView>): ResourceSampleView => ({
    at: 1,
    appRssBytes: null,
    appCpuPercent: null,
    hubRssBytes: null,
    hubCpuPercent: null,
    workersRssBytes: null,
    systemTotalBytes: null,
    systemAvailableBytes: null,
    ...overrides,
  });

  test('压力 = 已用占比并钳位；样本缺失为 null', () => {
    expect(systemMemoryPressure(sample({ systemTotalBytes: 10 * GIB, systemAvailableBytes: 2.5 * GIB }))).toBe(0.75);
    expect(systemMemoryPressure(sample({ systemTotalBytes: 10, systemAvailableBytes: -10 }))).toBe(1);
    expect(systemMemoryPressure(sample({}))).toBeNull();
    expect(systemMemoryPressure(null)).toBeNull();
  });

  test('三段进程内存占比与降级', () => {
    expect(processMemorySegments(sample({ appRssBytes: 100 * MIB, hubRssBytes: 100 * MIB, workersRssBytes: 300 * MIB }))).toEqual({
      total: 500 * MIB,
      app: 100 * MIB,
      hub: 100 * MIB,
      workers: 300 * MIB,
    });
    expect(processMemorySegments(sample({}))).toBeNull();
    expect(processMemorySegments(null)).toBeNull();
  });
});

describe('文案取值', () => {
  test('相位/心跳/空闲/倒计时/上下文', () => {
    expect(phaseLabel('ready')).toBe(copy.runtime.phaseReady);
    expect(phaseLabel(null)).toBe(copy.runtime.phaseFailed);
    expect(heartbeatLabel(3_400)).toBe(copy.runtime.heartbeatAgo(3));
    expect(heartbeatLabel(null)).toBe(copy.runtime.heartbeatNever);
    expect(idleLabel(125_000)).toBe(copy.runtime.idleFor(2));
    expect(recycleCountdownLabel(92_900)).toBe(copy.runtime.recycleIn(93));
    expect(recycleCountdownLabel(-5)).toBe(copy.runtime.recycleIn(0));
    expect(contextUsagePercent(0.421)).toBe('42%');
    expect(contextUsagePercent(null)).toBe('—');
  });

  test('摘要文本行序：标题/版本/相位/心跳/重启/线程/workers + hub 版本行', () => {
    const snapshot = {
      hostPhase: 'ready',
      hostInfo: {
        version: '0.13.0',
        piVersion: '0.9.1',
        bunVersion: '1.2.0',
        pid: 4242,
        uptimeMs: 1,
        rssBytes: 1,
        threads: { live: 2, parked: 1, dead: 0 },
        subagents: { running: 1 },
        limits: {
          maxThreads: 8,
          idleRetireMs: 300_000,
          workerStaleMs: 1,
          workerExitTimeoutMs: 1,
          maxSubagents: 8,
          bashTimeoutMs: 0,
        },
        backend: { id: 'pi', version: '0.9.1', capabilities: [] },
      },
      heartbeatAgeMs: 2_000,
      restarts: { count: 1, lastCause: 'stale', lastAt: 1 },
      workers: [{}, {}, {}],
      latest: null,
      history: [],
      events: [],
      idleRecycleMinutes: 5,
      appVersion: '1.2.3',
    } as unknown as RuntimeSnapshotView;
    const text = buildSummaryText(snapshot);
    const lines = text.split('\n');
    expect(lines[0]).toBe(copy.runtime.summaryTitle);
    expect(text).toContain(`Pai 1.2.3`);
    expect(text).toContain(`${copy.runtime.hostPhase}: ${copy.runtime.phaseReady}`);
    expect(text).toContain(`${copy.runtime.heartbeat}: ${copy.runtime.heartbeatAgo(2)}`);
    expect(text).toContain(`${copy.runtime.restarts}: 1`);
    expect(text).toContain(`${copy.runtime.capacity}: ${copy.runtime.summaryThreads(2, 1, 0)}`);
    expect(text).toContain(`${copy.runtime.workersTitle}: 3`);
    expect(lines.at(-1)).toContain('0.13.0');
  });
});

describe('worker 筛选谓词', () => {
  test('表驱动：all/executing/idle/parked/dead', () => {
    const cases: ReadonlyArray<[{ state: string; isStreaming: boolean }, string, boolean]> = [
      [{ state: 'live', isStreaming: true }, 'executing', true],
      [{ state: 'live', isStreaming: true }, 'idle', false],
      [{ state: 'live', isStreaming: false }, 'idle', true],
      [{ state: 'live', isStreaming: false }, 'executing', false],
      [{ state: 'parked', isStreaming: false }, 'parked', true],
      [{ state: 'dead', isStreaming: false }, 'dead', true],
      [{ state: 'dead', isStreaming: false }, 'all', true],
    ];
    for (const [row, filter, expected] of cases) expect(matchesWorkerFilter(filter as never, row)).toBe(expected);
  });

  test('可回收空闲：live ∧ 非流式 ∧ 非常驻', () => {
    expect(isRecyclableIdle({ state: 'live', isStreaming: false, keepalive: false })).toBe(true);
    expect(isRecyclableIdle({ state: 'live', isStreaming: true, keepalive: false })).toBe(false);
    expect(isRecyclableIdle({ state: 'live', isStreaming: false, keepalive: true })).toBe(false);
    expect(isRecyclableIdle({ state: 'parked', isStreaming: false, keepalive: false })).toBe(false);
  });
});
