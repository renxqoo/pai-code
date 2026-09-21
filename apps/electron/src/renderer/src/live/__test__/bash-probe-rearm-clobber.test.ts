import { describe, expect, test } from 'bun:test';

import { createBashEndProbe } from '../bash-end-probe';
import type { InflightView } from '@paiapp/contracts';

/**
 * 对抗审查红测 B：bash 收尾探测的 schedule() 在覆盖 timers[threadId] 前不清旧句柄。
 * 时序：探测定时器到期 → probe invoke 在途 → 期间 bashOutput 事件再次 arm（新句柄入表）
 * → 在途 probe 回包「仍在跑」→ rearm 直接 set 覆盖，arm 的句柄泄漏。
 * 泄漏句柄随后到期仍会执行 probe → onSettled；此后 clear() 已无法阻止回调。
 *
 * 期望行为：clear(threadId) 之后不得再出现任何 onSettled/onStillRunning 回调。
 * 当前实现红：泄漏句柄照常触发 onSettled。
 */

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const running: InflightView = {
  turnStartSeq: 1,
  turnStartedAt: null,
  message: null,
  toolOutputs: [],
  bash: { id: 'b1', command: 'x', startedAt: 1 },
};
const done: InflightView = { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null };

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('红测 B：rearm 覆盖未清旧句柄 → clear 后泄漏句柄仍触发 onSettled', () => {
  test('在途 probe × 再 arm × rearm × clear：clear 后不得再回调', async () => {
    const pending: Array<Deferred<InflightView | null>> = [];
    const settled: string[] = [];
    const stillRunning: string[] = [];
    // 与 live-controller 相同接线：仍在跑 → rearm（引用后置，创建后即可用）
    const holder: { probe?: ReturnType<typeof createBashEndProbe> } = {};

    const probe = createBashEndProbe({
      delayMs: 50,
      isDisposed: () => false,
      probe: () => {
        const d = deferred<InflightView | null>();
        pending.push(d);
        return d.promise;
      },
      onSettled: (threadId) => settled.push(threadId),
      onStillRunning: (threadId) => {
        stillRunning.push(threadId);
        holder.probe?.rearm(threadId);
      },
    });
    holder.probe = probe;

    // 1) 首次 arm（bashOutput 事件路径）：T1 @50ms
    probe.arm('t1');
    await wait(60); // T1 到期，probe P1 挂起在途（timers 表已自删）
    expect(pending.length).toBe(1);

    // 2) 输出事件再次 arm（与 live-controller onEvent 'bashOutput' 同路径）：T2 @~110ms
    probe.arm('t1');

    // 3) 在途 P1 回包「仍在跑」→ onStillRunning → rearm：schedule 直接覆盖表项，
    //    T2 句柄不在表中、无人 clearTimeout —— 泄漏
    pending[0]?.resolve(running);
    await wait(5); // 微任务落地：rearm 已排 T3
    expect(stillRunning).toEqual(['t1']);

    // 4) 会话移除 / runBash 收尾路径调用 clear：只能清到表中的 T3
    probe.clear('t1');

    // 5) 泄漏的 T2 到期 → 仍会 probe → onSettled
    await wait(120);
    for (const d of pending.splice(0)) d.resolve(done);
    await wait(10);

    // 期望：clear 之后零回调
    expect(settled).toEqual([]);
  });
});
