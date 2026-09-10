import { describe, expect, test } from 'bun:test';

import type { RuntimeSnapshotView, SessionStatsView, SessionView, WorkerRowView } from '@paiapp/contracts';

import { buildRuntimeRows, runtimeHealthLevel } from '../runtime-entries';

/** 运行状态页行装配（T29）：hub 行 × 会话标题 × stats × 排队 × 倒计时。 */

function worker(overrides: Partial<WorkerRowView> = {}): WorkerRowView {
  return {
    threadId: 't1',
    cwd: '/w/app',
    sessionPath: '/w/app/s.jsonl',
    state: 'live',
    isStreaming: false,
    idleMs: 0,
    subagents: 0,
    rssBytes: null,
    keepalive: false,
    ...overrides,
  };
}

function session(threadId: string, title: string): SessionView {
  return {
    threadId,
    cwd: '/w/app',
    sessionPath: null,
    title,
    state: 'live',
    streaming: false,
    model: null,
    thinkingLevel: null,
    lastActivityAt: 1,
  };
}

const stats = (tokensTotal: number): SessionStatsView => ({
  userMessages: 1,
  assistantMessages: 1,
  toolCalls: 0,
  tokensTotal,
  cost: 0,
  contextUsage: 0.5,
});

describe('buildRuntimeRows', () => {
  test('join 全字段：标题回落、stats 缺省 null、排队计数、倒计时', () => {
    const rows = buildRuntimeRows({
      workers: [
        worker({ threadId: 't1', idleMs: 60_000, rssBytes: 111 }),
        worker({ threadId: 'outside', cwd: '/other' }),
        worker({ threadId: 't2', isStreaming: true }),
        worker({ threadId: 't3', keepalive: true, idleMs: 999_999 }),
      ],
      sessions: { t1: session('t1', '重构渲染层'), t2: session('t2', '修 CSS') },
      statsById: { t1: stats(1200) },
      queueCountOf: (threadId) => (threadId === 't1' ? 3 : 0),
      idleRetireMs: 300_000,
    });
    expect(rows[0]).toMatchObject({ threadId: 't1', title: '重构渲染层', stats: { tokensTotal: 1200 }, queueCount: 3, recycleInMs: 240_000 });
    // 表外会话：标题回落 threadId 前缀，stats null
    expect(rows[1]?.title.length).toBeLessThanOrEqual(13);
    expect(rows[1]?.stats).toBeNull();
    // 执行中不显示倒计时；常驻不显示倒计时
    expect(rows[2]?.recycleInMs).toBeNull();
    expect(rows[3]?.recycleInMs).toBeNull();
    // idleRetireMs 未知 → 全部 null
    expect(buildRuntimeRows({ workers: [worker({ idleMs: 1 })], sessions: {}, statsById: {}, queueCountOf: () => 0, idleRetireMs: null })[0]?.recycleInMs).toBeNull();
  });

  test('倒计时下限钳 0（超期未回收的窗口）', () => {
    const rows = buildRuntimeRows({
      workers: [worker({ idleMs: 400_000 })],
      sessions: {},
      statsById: {},
      queueCountOf: () => 0,
      idleRetireMs: 300_000,
    });
    expect(rows[0]?.recycleInMs).toBe(0);
  });
});

describe('runtimeHealthLevel（页面健康灯）', () => {
  const snapshot = (overrides: Partial<RuntimeSnapshotView>): RuntimeSnapshotView => ({
    hostPhase: 'ready',
    hostInfo: { threads: { live: 0, parked: 0, dead: 0 } } as RuntimeSnapshotView['hostInfo'],
    heartbeatAgeMs: 100,
    restarts: { count: 0, lastCause: null, lastAt: null },
    workers: [],
    latest: null,
    history: [],
    events: [],
    idleRecycleMinutes: 5,
    appVersion: 'x',
    ...overrides,
  });

  test('相位/心跳/异常线程分级', () => {
    expect(runtimeHealthLevel(snapshot({}))).toBe('healthy');
    expect(runtimeHealthLevel(snapshot({ hostPhase: 'failed' }))).toBe('failed');
    expect(runtimeHealthLevel(snapshot({ hostPhase: 'restarting' }))).toBe('degraded');
    expect(runtimeHealthLevel(snapshot({ hostPhase: null }))).toBe('degraded');
    expect(runtimeHealthLevel(snapshot({ heartbeatAgeMs: 9_000 }))).toBe('degraded');
    expect(runtimeHealthLevel(snapshot({ hostInfo: { threads: { live: 0, parked: 0, dead: 1 } } as RuntimeSnapshotView['hostInfo'] }))).toBe('degraded');
  });
});
