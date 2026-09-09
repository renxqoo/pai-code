import { describe, expect, test } from 'bun:test';

import { createQueuedDrafts, diffSettledThreads, runStateOf, type QueuedDraft, type QueuedDraftSubmit } from '../queued-drafts';

/** 提交记录器：按序返回成败（null = 成功），记录 (threadId, text, mode)。 */
function recorder(outcomes: readonly (string | null)[]): {
  submit: QueuedDraftSubmit
  calls: { threadId: string; text: string; mode: 'steer' | 'followUp' }[]
} {
  const calls: { threadId: string; text: string; mode: 'steer' | 'followUp' }[] = [];
  return {
    calls,
    submit: (threadId, draft, mode) => {
      calls.push({ threadId, text: draft.text, mode });
      return Promise.resolve(outcomes[calls.length - 1] ?? null);
    },
  };
}

function texts(drafts: readonly QueuedDraft[]): string[] {
  return drafts.map((draft) => draft.text);
}

describe('queued-drafts 暂存操作', () => {
  test('stage 追加到对应线程（记录会话路径）并通知订阅者', () => {
    const store = createQueuedDrafts();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.stage('t1', '/w/a.jsonl', '第一条', []);
    store.stage('t1', '/w/a.jsonl', '第二条', []);
    store.stage('t2', null, '别的线程', []);
    expect(texts(store.snapshot().t1 ?? [])).toEqual(['第一条', '第二条']);
    expect(texts(store.snapshot().t2 ?? [])).toEqual(['别的线程']);
    expect(store.pathOf('t1')).toBe('/w/a.jsonl');
    expect(store.pathOf('t2')).toBeNull();
    expect(store.pathOf('unknown')).toBeNull();
    expect(notified).toBe(3);
  });

  test('take 取出并移除；不存在的 id 返回 null', () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '好了吗', []);
    const taken = store.take('t1', 1);
    expect(taken?.text).toBe('好了吗');
    expect(store.take('t1', 1)).toBeNull();
    expect(store.snapshot().t1).toBeUndefined();
  });

  test('dropThread 只丢弃目标线程（连同路径记录）', () => {
    const store = createQueuedDrafts();
    store.stage('t1', '/w/a.jsonl', 'a', []);
    store.stage('t2', '/w/b.jsonl', 'b', []);
    store.dropThread('t1');
    expect(store.snapshot().t1).toBeUndefined();
    expect(store.pathOf('t1')).toBeNull();
    expect(texts(store.snapshot().t2 ?? [])).toEqual(['b']);
  });
});

describe('queued-drafts 轮末冲刷', () => {
  test('自然结算：按入队序以 followUp 逐条投递并清空', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '一', []);
    store.stage('t1', null, '二', []);
    store.stage('t1', null, '三', []);
    const { submit, calls } = recorder([null, null, null]);
    await store.flush('t1', submit);
    expect(calls.map((call) => [call.text, call.mode])).toEqual([
      ['一', 'followUp'],
      ['二', 'followUp'],
      ['三', 'followUp'],
    ]);
    expect(store.snapshot().t1).toBeUndefined();
  });

  test('失败即停：已成功的移除，失败条及余量保留', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '一', []);
    store.stage('t1', null, '二', []);
    store.stage('t1', null, '三', []);
    const { submit, calls } = recorder([null, 'bridge_down']);
    await store.flush('t1', submit);
    expect(calls.map((call) => call.text)).toEqual(['一', '二']);
    expect(texts(store.snapshot().t1 ?? [])).toEqual(['二', '三']);
  });

  test('提交桥异常不击穿：按失败处理（余量保留、链不断）', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '一', []);
    store.stage('t1', null, '二', []);
    const submit: QueuedDraftSubmit = () => Promise.reject(new Error('ipc gone'));
    await store.flush('t1', submit);
    expect(texts(store.snapshot().t1 ?? [])).toEqual(['一', '二']);
    // 链未断：后续操作照常执行
    const { submit: ok } = recorder([null, null]);
    await store.flush('t1', ok);
    expect(store.snapshot().t1).toBeUndefined();
  });

  test('空线程冲刷为无操作（不进串行链）', async () => {
    const store = createQueuedDrafts();
    const { submit, calls } = recorder([]);
    await store.flush('t1', submit);
    expect(calls).toEqual([]);
  });

  test('串行防双发：冲刷在途时立即改向同一条不会重复投递', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '头', []);
    store.stage('t1', null, '尾', []);
    const { submit, calls } = recorder([null, null]);
    const flushing = store.flush('t1', submit);
    const sendNow = store.sendNow('t1', 1, submit);
    await Promise.all([flushing, sendNow]);
    // 头只被冲刷投递一次（followUp），立即改向到达时卡片已移除
    expect(calls.map((call) => [call.text, call.mode])).toEqual([
      ['头', 'followUp'],
      ['尾', 'followUp'],
    ]);
    expect(store.snapshot().t1).toBeUndefined();
  });
});

describe('queued-drafts 立即改向', () => {
  test('先移除再以 steer 投递；失败回插原位', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '前', []);
    store.stage('t1', null, '中', []);
    store.stage('t1', null, '后', []);
    const { submit, calls } = recorder(['reject']);
    await store.sendNow('t1', 2, submit);
    expect(calls.map((call) => [call.text, call.mode])).toEqual([['中', 'steer']]);
    expect(texts(store.snapshot().t1 ?? [])).toEqual(['前', '中', '后']);
  });

  test('成功后卡片消失', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '中', []);
    const { submit } = recorder([null]);
    await store.sendNow('t1', 1, submit);
    expect(store.snapshot().t1).toBeUndefined();
  });

  test('提交桥异常回插原位（不吞卡片、不产生未处理拒绝）', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, '前', []);
    store.stage('t1', null, '中', []);
    const submit: QueuedDraftSubmit = () => Promise.reject(new Error('ipc gone'));
    await store.sendNow('t1', 2, submit);
    expect(texts(store.snapshot().t1 ?? [])).toEqual(['前', '中']);
  });

  test('目标不存在（已被编辑/移除）为无操作', async () => {
    const store = createQueuedDrafts();
    store.stage('t1', null, 'a', []);
    store.remove('t1', 1);
    const { submit, calls } = recorder([]);
    await store.sendNow('t1', 1, submit);
    expect(calls).toEqual([]);
  });
});

describe('queued-drafts 重开换 id 改绑', () => {
  test('hasPathHost 判定路径宿主（排除自身与空线程）', () => {
    const store = createQueuedDrafts();
    store.stage('t1', '/w/a.jsonl', 'a', []);
    expect(store.hasPathHost('/w/a.jsonl', 't2')).toBe(true);
    expect(store.hasPathHost('/w/a.jsonl', 't1')).toBe(false);
    expect(store.hasPathHost('/w/b.jsonl', 't2')).toBe(false);
    store.remove('t1', 1);
    expect(store.hasPathHost('/w/a.jsonl', 't2')).toBe(false);
  });

  test('reattachByPath 并入目标线程并按全局时间序恢复', () => {
    const store = createQueuedDrafts();
    store.stage('t1', '/w/a.jsonl', 't1-一', []);
    store.stage('t1', '/w/a.jsonl', 't1-二', []);
    store.stage('t9', '/w/a.jsonl', 't9-晚入队', []);
    store.stage('t2', '/w/b.jsonl', '别路径', []);
    store.reattachByPath('/w/a.jsonl', 't3');
    expect(store.snapshot().t1).toBeUndefined();
    expect(store.snapshot().t9).toBeUndefined();
    expect(texts(store.snapshot().t3 ?? [])).toEqual(['t1-一', 't1-二', 't9-晚入队']);
    expect(store.pathOf('t3')).toBe('/w/a.jsonl');
    // 其他路径不受影响
    expect(texts(store.snapshot().t2 ?? [])).toEqual(['别路径']);
  });

  test('reattachByPath 无宿主时为无操作', () => {
    const store = createQueuedDrafts();
    store.stage('t2', '/w/b.jsonl', 'b', []);
    store.reattachByPath('/w/none.jsonl', 't2');
    expect(texts(store.snapshot().t2 ?? [])).toEqual(['b']);
  });

  test('reattachByPath 与目标既有暂存整体按时间序归并', () => {
    const store = createQueuedDrafts();
    store.stage('t1', '/w/a.jsonl', '旧线程先排', []);
    store.stage('t3', '/w/a.jsonl', '新线程后开但先入队', []);
    store.stage('t3', '/w/a.jsonl', '新线程第二条', []);
    store.reattachByPath('/w/a.jsonl', 't3');
    expect(texts(store.snapshot().t3 ?? [])).toEqual(['旧线程先排', '新线程后开但先入队', '新线程第二条']);
    expect(store.snapshot().t1).toBeUndefined();
  });
});

describe('diffSettledThreads 轮结束侦测', () => {
  const run = (streaming: boolean, stopping = false, crashed = false) => ({ streaming, stopping, crashed });

  test('自然结算（streaming true→false）触发冲刷', () => {
    const result = diffSettledThreads({ t1: run(true) }, { t1: run(false) }, { t1: {} });
    expect(result.flush).toEqual(['t1']);
    expect(result.drop).toEqual([]);
  });

  test('用户停止意图的结算不冲刷（卡片保留由用户处置）', () => {
    const result = diffSettledThreads({ t1: run(true, true) }, { t1: run(false) }, { t1: {} });
    expect(result.flush).toEqual([]);
  });

  test('worker/宿主死亡的结算不冲刷', () => {
    const result = diffSettledThreads({ t1: run(true) }, { t1: run(false, false, true) }, { t1: {} });
    expect(result.flush).toEqual([]);
  });

  test('轮开始与持续流式不触发', () => {
    expect(diffSettledThreads({ t1: run(false) }, { t1: run(true) }, { t1: {} }).flush).toEqual([]);
    expect(diffSettledThreads({ t1: run(true) }, { t1: run(true) }, { t1: {} }).flush).toEqual([]);
  });

  test('新出现的线程（侦测订阅前的旧态缺失）不触发', () => {
    const result = diffSettledThreads({}, { t1: run(false) }, { t1: {} });
    expect(result.flush).toEqual([]);
  });

  test('线程与会话同时消失 → drop（是否真丢由调用方按路径宿主再判定）', () => {
    const result = diffSettledThreads({ t1: run(false), t2: run(true) }, { t2: run(false) }, { t2: {} });
    expect(result.drop).toEqual(['t1']);
    expect(result.flush).toEqual(['t2']);
  });

  test('线程态消失但会话仍在（无此路径的防御）不 drop 不 flush', () => {
    const result = diffSettledThreads({ t1: run(true) }, {}, { t1: {} });
    expect(result.drop).toEqual([]);
    expect(result.flush).toEqual([]);
  });
});

describe('runStateOf 运行面投影', () => {
  test('只取结算判定字段', () => {
    const state = runStateOf({ t1: { streaming: true, stopping: false, crashed: false, extra: 'ignored' } });
    expect(state.t1).toEqual({ streaming: true, stopping: false, crashed: false });
  });
});
