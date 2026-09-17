import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RuntimeSnapshotView } from '@paiapp/contracts';

import { copy } from '@/strings';

import type { RuntimeWorkerRow } from '../runtime-entries';
import type { RuntimeScreenActions } from '../runtime-content';
import { RuntimeContent } from '../runtime-content';

/** 运行状态整页冒烟（静态口径：SSR 不跑轮询 effect；交互与真机走查走 E2E）。 */

const actions: RuntimeScreenActions = {
  stopThread: () => undefined,
  retireSession: () => Promise.resolve(),
  forceRetireSession: () => Promise.resolve(),
  setKeepalive: () => Promise.resolve(),
  setIdleRecycle: () => Promise.resolve(),
  showNotice: () => undefined,
  exportDiagnostics: () => Promise.resolve(true),
  restartHost: () => undefined,
};

function snapshot(overrides: Partial<RuntimeSnapshotView> = {}): RuntimeSnapshotView {
  return {
    hostPhase: 'ready',
    hostInfo: {
      version: '1.0.0',
      bunVersion: '1.2.0',
      pid: 4242,
      uptimeMs: 3_600_000,
      rssBytes: 64 * 1024 * 1024,
      threads: { live: 1, parked: 1, dead: 0 },
      limits: { maxThreads: 8, idleRetireMs: 300_000, workerStaleMs: 60_000, workerExitTimeoutMs: 5_000, rssRetireBytes: 0, bashTimeoutMs: 0 },
    },
    heartbeatAgeMs: 2_000,
    restarts: { count: 0, lastCause: null, lastAt: null },
    workers: [],
    latest: {
      at: 1_000,
      appRssBytes: 128 * 1024 * 1024,
      appCpuPercent: 1.5,
      hubRssBytes: 64 * 1024 * 1024,
      hubCpuPercent: 0.5,
      workersRssBytes: 256 * 1024 * 1024,
      systemTotalBytes: 16 * 1024 * 1024 * 1024,
      systemAvailableBytes: 8 * 1024 * 1024 * 1024,
    },
    history: [
      {
        at: 1_000,
        appRssBytes: 128 * 1024 * 1024,
        appCpuPercent: 1.5,
        hubRssBytes: null,
        hubCpuPercent: null,
        workersRssBytes: null,
        systemTotalBytes: null,
        systemAvailableBytes: null,
      },
    ],
    events: [{ at: 1_000, level: 'warn', kind: 'worker_recycled', detail: 'worker recycled after idle window' }],
    idleRecycleMinutes: 5,
    appVersion: '1.2.3',
    ...overrides,
  };
}

function row(overrides: Partial<RuntimeWorkerRow> = {}): RuntimeWorkerRow {
  return {
    threadId: 't1',
    cwd: '/w/app',
    sessionPath: null,
    state: 'live',
    isStreaming: false,
    idleMs: 65_000,
    rssBytes: 200 * 1024 * 1024,
    keepalive: false,
    title: '重构渲染层',
    model: 'glm/glm-5.3',
    stats: { userMessages: 1, assistantMessages: 1, toolCalls: 0, tokens: { input: 800, output: 400, total: 1200 }, cost: 0 },
    queueCount: 0,
    recycleInMs: 235_000,
    ...overrides,
  };
}

function renderScreen(overrides: Partial<Parameters<typeof RuntimeContent>[0]> = {}): string {
  return renderToStaticMarkup(
    <RuntimeContent
      snapshot={snapshot()}
      fetchFailed={false}
      rows={[]}
      diagnosticLog={null}
      actions={actions}
      onLoadDiagnosticLog={() => undefined}
      onOpenSession={() => undefined}
      {...overrides}
    />,
  );
}

describe('RuntimeContent', () => {
  test('正常快照：健康灯/相位/容量/内存与走势标题齐全，健康档为健康', () => {
    const html = renderScreen();
    // 设置分区形态：标题由 SettingsPageHeader 承担，内容首行为健康灯
    expect(html).toContain(copy.runtime.healthHealthy);
    expect(html).toContain(copy.runtime.phaseReady);
    expect(html).toContain(copy.runtime.heartbeatAgo(2));
    expect(html).toContain(copy.runtime.stateLive);
    expect(html).toContain(copy.runtime.capacity);
    expect(html).toContain(copy.runtime.memory);
    expect(html).toContain(copy.runtime.resourceTrend);
    expect(html).toContain(copy.runtime.recycleAllIdle);
    expect(html).toContain(copy.runtime.copySummary);
    expect(html).toContain(copy.runtime.restartHost);
  });

  test('worker 行：标题/状态/倒计时/Token 计量进表', () => {
    const html = renderScreen({ rows: [row()] });
    expect(html).toContain('重构渲染层');
    expect(html).toContain(copy.runtime.idle);
    expect(html).toContain(copy.runtime.idleFor(1));
    expect(html).toContain(copy.runtime.recycleIn(235));
    expect(html).toContain('1.2k');
    expect(html).toContain('200 MB');
  });

  test('worker 行全状态形态：执行中/常驻/已归档/异常各自徽章与动作进表', () => {
    const html = renderScreen({
      rows: [
        row({ threadId: 'a', isStreaming: true, recycleInMs: null }),
        row({ threadId: 'b', keepalive: true, idleMs: 900_000, recycleInMs: null }),
        row({ threadId: 'c', state: 'parked', recycleInMs: null }),
        row({ threadId: 'd', state: 'dead', recycleInMs: null }),
      ],
    });
    expect(html).toContain(copy.runtime.executing);
    expect(html).toContain(copy.runtime.keepaliveOn);
    expect(html).toContain(copy.runtime.parked);
    expect(html).toContain(copy.runtime.dead);
  });

  test('快照拉取失败显示失败态（静默等待帧会掩盖主进程/IPC 断链）', () => {
    const html = renderScreen({ snapshot: null, fetchFailed: true });
    expect(html).toContain(copy.runtime.fetchFailed);
    expect(html).not.toContain(copy.runtime.emptyHistory);
  });

  test('空 worker 表显示空态；stderr 已加载时展示 pre 块', () => {
    const html = renderScreen();
    expect(html).toContain(copy.runtime.noWorkers);
    const withLog = renderScreen({ diagnosticLog: '[hub] listening\n' });
    expect(withLog).toContain('[hub] listening');
    expect(withLog).not.toContain(copy.runtime.stderrLoad);
  });

  test('宿主不可用（hostPhase null）：横幅提示 + 降级灯 + 诊断区仍完整可用', () => {
    const html = renderScreen({
      snapshot: snapshot({ hostPhase: null, hostInfo: null, heartbeatAgeMs: null }),
      rows: [row({ state: 'dead', recycleInMs: null, isStreaming: false })],
    });
    expect(html).toContain(copy.runtime.hostUnavailable);
    expect(html).toContain(copy.runtime.healthDegraded);
    // 诊断区（排障落点）照常渲染
    expect(html).toContain(copy.runtime.timeline);
    expect(html).toContain(copy.runtime.stderrLoad);
    expect(html).toContain('worker_recycled');
    expect(html).toContain(copy.runtime.dead);
    // 表操作入口仍然给出（菜单弹层未开不渲染，只验触发器）
    expect(html).toContain(copy.runtime.rowMenu);
  });

  test('宿主 failed：健康灯转故障档', () => {
    const html = renderScreen({ snapshot: snapshot({ hostPhase: 'failed', hostInfo: null }) });
    expect(html).toContain(copy.runtime.healthFailed);
  });
});
