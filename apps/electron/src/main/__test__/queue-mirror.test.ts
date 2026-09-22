import { describe, expect, test } from 'bun:test';

import { createQueueMirror, type QueueStateOutcome } from '../queue-mirror';

/**
 * 队列镜像链回归（对抗审查 P2）：spliced 信号 → get_state 拉取 → queueChanged 合成。
 * 覆盖：在途合并 + dirty 补拍（快照后并发写不丢——drop/send_now 的 UI 收敛依赖）、
 * 恰一次重试、重试在飞守卫（回归：旧实现 .finally 在递归重试在飞时误删 pending 标记，
 * 守卫失效起并发拉取）、异常路径释放。
 */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const ok = (data: unknown): QueueStateOutcome => ({ ok: true, data });
const fail = (): QueueStateOutcome => ({ ok: false });

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('createQueueMirror 队列面镜像', () => {
  test('在途信号合并 + dirty 补拍：拉取在飞时 N 连信号只并一拍，完成后恰一补拉（快照后并发写不丢）', async () => {
    const first = deferred<QueueStateOutcome>();
    const second = deferred<QueueStateOutcome>();
    const gates = [first, second];
    let calls = 0;
    const emitted: Array<[unknown, string]> = [];
    const mirror = createQueueMirror({
      fetchState: () => {
        calls += 1;
        return (gates[calls - 1] ?? deferred<QueueStateOutcome>()).promise;
      },
      emitQueue: (data, threadId) => emitted.push([data, threadId]),
    });
    mirror.signal('t1');
    mirror.signal('t1'); // 在途：快照已定格，并入 dirty
    mirror.signal('t1');
    await wait(10);
    expect(calls).toBe(1); // 在途不并发拉取
    first.resolve(ok({ queue: { followUp: ['旧快照'] } }));
    await wait(10);
    expect(calls).toBe(2); // dirty 补拍恰一拍（不吞并发写）
    expect(emitted[0]).toEqual([{ queue: { followUp: ['旧快照'] } }, 't1']);
    second.resolve(ok({ queue: { followUp: ['新快照'] } }));
    await wait(10);
    expect(calls).toBe(2); // 补拍后无残留标记
    expect(emitted[1]).toEqual([{ queue: { followUp: ['新快照'] } }, 't1']);
    // 链终结后新信号再拉
    mirror.signal('t1');
    await wait(10);
    expect(calls).toBe(3);
  });

  test('无并发信号的普通拉取：完成后不补拍（dirty 位只在在途信号时置位）', async () => {
    let calls = 0;
    const mirror = createQueueMirror({
      fetchState: () => {
        calls += 1;
        return Promise.resolve(ok({ queue: { followUp: ['a'] } }));
      },
      emitQueue: () => undefined,
    });
    mirror.signal('t1');
    await wait(10);
    expect(calls).toBe(1);
  });

  test('恰一次重试：首败后重试成功合成队列面', async () => {
    let calls = 0;
    const emitted: unknown[] = [];
    const mirror = createQueueMirror({
      fetchState: () => {
        calls += 1;
        return Promise.resolve(calls === 1 ? fail() : ok({ queue: { followUp: ['b'] } }));
      },
      emitQueue: (data) => emitted.push(data),
    });
    mirror.signal('t1');
    await wait(20);
    expect(calls).toBe(2);
    expect(emitted).toEqual([{ queue: { followUp: ['b'] } }]);
  });

  test('回归：重试在飞时守卫连续——新信号并入 dirty，不并发起拉取（旧实现 .finally 误删标记）', async () => {
    const first = deferred<QueueStateOutcome>();
    const retryGate = deferred<QueueStateOutcome>();
    let calls = 0;
    const mirror = createQueueMirror({
      fetchState: () => {
        calls += 1;
        return calls === 1 ? first.promise : retryGate.promise;
      },
      emitQueue: () => undefined,
    });
    mirror.signal('t1');
    await wait(10);
    first.resolve(fail()); // 触发恰一次重试（retryGate 在飞）
    await wait(10);
    expect(calls).toBe(2);
    mirror.signal('t1'); // 重试在飞：并入 dirty，不得立即第三拉
    mirror.signal('t1');
    await wait(10);
    expect(calls).toBe(2);
    retryGate.resolve(ok({ queue: { followUp: [] } }));
    await wait(10);
    expect(calls).toBe(3); // 重试成功后按 dirty 恰一补拍
  });

  test('两次都失败：标记释放，悬挂至下一信号；异常路径同样释放', async () => {
    let calls = 0;
    const mirror = createQueueMirror({
      fetchState: () => {
        calls += 1;
        return Promise.resolve(fail());
      },
      emitQueue: () => undefined,
    });
    mirror.signal('t1');
    await wait(20);
    expect(calls).toBe(2); // 首拉+恰一次重试后停
    mirror.signal('t1'); // 新信号重新起链
    await wait(20);
    expect(calls).toBe(4);

    let threw = false;
    const throwing = createQueueMirror({
      fetchState: () => {
        threw = true;
        return Promise.reject(new Error('bridge gone'));
      },
      emitQueue: () => undefined,
    });
    throwing.signal('t2');
    await wait(20);
    expect(threw).toBe(true); // 拒绝被吞（调用方无感），链终结
  });
});
