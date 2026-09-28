import { describe, expect, test } from 'bun:test';

import type { UiEvent } from '@paiapp/contracts';

import { createEventFanout, type EventSink } from '../event-fanout';

function makeSink(): EventSink & { received: Array<{ seq: number; event: UiEvent }> } {
  const received: Array<{ seq: number; event: UiEvent }> = [];
  return {
    received,
    sendEvent: (seq, event) => received.push({ seq, event }),
    lastAck: () => 0,
  };
}

const ev = (n: number): UiEvent => ({ type: 'turnStarted', threadId: `t${n}`, at: n });

describe('事件扇出', () => {
  test('publish 广播到已 attach 连接；seq 单调', () => {
    const fanout = createEventFanout();
    const sink = makeSink();
    fanout.attach(sink, 0);
    fanout.publish(ev(1));
    fanout.publish(ev(2));
    expect(sink.received.map((r) => r.seq)).toEqual([1, 2]);
  });

  test('attach 带 watermark 只续传缺口', () => {
    const fanout = createEventFanout();
    fanout.publish(ev(1));
    fanout.publish(ev(2));
    fanout.publish(ev(3));
    const sink = makeSink();
    fanout.attach(sink, 2); // 已确认到 2
    expect(sink.received.map((r) => r.seq)).toEqual([3]);
  });

  test('detach 后不再接收', () => {
    const fanout = createEventFanout();
    const sink = makeSink();
    fanout.attach(sink, 0);
    fanout.publish(ev(1));
    fanout.detach(sink);
    fanout.publish(ev(2));
    expect(sink.received.map((r) => r.seq)).toEqual([1]);
  });

  test('环形缓冲丢最旧（超限后 attach 只见窗口内）', () => {
    const fanout = createEventFanout();
    for (let i = 0; i < 2050; i += 1) fanout.publish(ev(i));
    const sink = makeSink();
    fanout.attach(sink, 0);
    expect(sink.received.length).toBe(2000);
    expect(sink.received[0]?.seq).toBe(51);
    expect(sink.received[1999]?.seq).toBe(2050);
  });
});
