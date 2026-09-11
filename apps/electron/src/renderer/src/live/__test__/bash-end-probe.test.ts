import { describe, expect, test } from 'bun:test';

import { BASH_END_PROBE_MAX_REARMS, createBashEndProbe } from '../bash-end-probe';
import type { InflightView } from '@paiapp/contracts';

/** 直执行 bash 收尾探测：静默后读口确认收尾；仍在跑时有界重排；四条回收路径。 */

const view = (bash: InflightView['bash']): InflightView => ({ turnStartEntryId: 'e1', message: null, toolOutputs: [], bash });

function harness(views: Array<InflightView | null>, opts?: { slowMs?: number }): { settled: string[]; stillRunning: number; probe: ReturnType<typeof createBashEndProbe> } {
  let index = 0;
  const settled: string[] = [];
  const state = { stillRunning: 0 };
  const probe = createBashEndProbe({
    delayMs: 1,
    ...(opts?.slowMs !== undefined ? { slowMs: opts.slowMs } : {}),
    isDisposed: () => false,
    probe: () => Promise.resolve(views[Math.min(index++, views.length - 1)] ?? null),
    onSettled: (threadId) => settled.push(threadId),
    onStillRunning: (threadId) => {
      state.stillRunning += 1;
      probe.rearm(threadId);
    },
  });
  return {
    settled,
    get stillRunning() {
      return state.stillRunning;
    },
    probe,
  };
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('bash 收尾探测', () => {
  test('读口说没有在途 bash → 收尾回调一次', async () => {
    const h = harness([view(null)]);
    h.probe.arm('t1');
    await wait(20);
    expect(h.settled).toEqual(['t1']);
  });

  test('症状回归「静默长命令耗尽快频预算后无人收尾」：快频有界，耗尽后转慢频直至收尾', async () => {
    // 前 40 次读口都说仍在跑（快频 ~31 次 + 慢频继续），之后结束
    const running = view({ command: 'x', output: '', truncated: false, startedAt: 1 });
    const views: Array<InflightView | null> = Array.from({ length: 40 }, () => running);
    views.push(view(null));
    const h = harness(views, { slowMs: 2 });
    h.probe.arm('t1');
    await wait(400);
    // 快频预算（≤ MAX_REARMS+1 次 1ms 探测）耗尽后仍最终收尾——慢频兜底在跑
    expect(h.settled).toEqual(['t1']);
    expect(h.stillRunning).toBeGreaterThan(BASH_END_PROBE_MAX_REARMS);
  });

  test('快频预算内的成本有界：耗尽点之后单个慢周期内不额外快频探测', async () => {
    const running = view({ command: 'x', output: '', truncated: false, startedAt: 1 });
    const h = harness(Array.from({ length: 100 }, () => running), { slowMs: 80 });
    h.probe.arm('t1');
    // 31 次快频（arm + 30 次快频重排）在 ~31ms 内完成；随后只剩慢频
    await wait(45);
    const fastBudget = h.stillRunning;
    expect(fastBudget).toBeLessThanOrEqual(BASH_END_PROBE_MAX_REARMS + 1);
    // 首个慢频周期（80ms）落地之前：无任何额外探测
    await wait(30);
    expect(h.stillRunning).toBe(fastBudget);
  });

  test('先仍在跑、随后结束 → 最终收尾', async () => {
    const h = harness([view({ command: 'x', output: '', truncated: false, startedAt: 1 }), view(null)]);
    h.probe.arm('t1');
    await wait(40);
    expect(h.settled).toEqual(['t1']);
  });

  test('clear 后不再回调（runBash 本地发起路径复用同一探测）', async () => {
    const h = harness([view(null)]);
    h.probe.arm('t1');
    h.probe.clear('t1');
    await wait(20);
    expect(h.settled).toEqual([]);
  });

  test('clearAll 回收全部（dispose / 宿主消亡）', async () => {
    const h = harness([view(null)]);
    h.probe.arm('t1');
    h.probe.arm('t2');
    h.probe.clearAll();
    await wait(20);
    expect(h.settled).toEqual([]);
  });
});
