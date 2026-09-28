/**
 * 事件扇出 + 环形缓冲（T57 §4）：主进程 UiEvent 泵的第二个消费者。
 * 语义：per-连接 seq 单调；客户端 ack 推进水位；重连按水位重发缺口；
 * 缓冲上限 2000 丢最旧（缺口超出时客户端经 session/entries 水化兜底）。
 */
import { BRIDGE_EVENT_BUFFER_LIMIT, type UiEvent } from '@paiapp/contracts';

interface BufferEntry {
  seq: number;
  event: UiEvent;
}

export interface EventFanout {
  /** 主进程事件泵入口（每事件调用：入缓冲 + 广播已鉴权连接）。 */
  publish(event: UiEvent): void;
  /** 已鉴权连接注册（注册即从 watermark+1 续传缓冲缺口）。 */
  attach(sink: EventSink, watermark: number): void;
  detach(sink: EventSink): void;
  /** 连接 ack 水位推进（落后窗口内的缓冲保留）。 */
  acknowledge(sink: EventSink, seq: number): void;
}

export interface EventSink {
  sendEvent(seq: number, event: UiEvent): void;
  lastAck(): number;
}

export function createEventFanout(): EventFanout {
  const ring: BufferEntry[] = [];
  let nextSeq = 1;
  const sinks = new Set<EventSink>();

  const replayFrom = (sink: EventSink, watermark: number): void => {
    for (const entry of ring) {
      if (entry.seq > watermark) sink.sendEvent(entry.seq, entry.event);
    }
  };

  return {
    publish(event) {
      const entry: BufferEntry = { seq: nextSeq, event };
      nextSeq += 1;
      ring.push(entry);
      if (ring.length > BRIDGE_EVENT_BUFFER_LIMIT) ring.splice(0, ring.length - BRIDGE_EVENT_BUFFER_LIMIT);
      for (const sink of sinks) sink.sendEvent(entry.seq, entry.event);
    },
    attach(sink, watermark) {
      sinks.add(sink);
      replayFrom(sink, watermark);
    },
    detach(sink) {
      sinks.delete(sink);
    },
    acknowledge(sink, seq) {
      // 水位存在 sink 自身（lastAck）；缓冲保留供新连接重放，无需逐条释放
      void sink;
      void seq;
    },
  };
}
