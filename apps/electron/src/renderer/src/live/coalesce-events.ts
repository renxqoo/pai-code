import type { UiEvent } from '@paiapp/contracts';

/**
 * 50ms 批内相邻同类 delta 折叠：同线程同消息的连续 text/thinking delta 拼接为一条，
 * 让 store 每批每块至多折叠一次（消灭批内逐条 set 的重复全量拷贝与字符串拼接）。
 * 仅折叠「相邻」事件：批本身有序，不重排、不跨事件类合并；
 * 其余事件原样透传——批语义与逐条投递等价（批内中间态本就不产生可见渲染）。
 */

type DeltaEvent = Extract<UiEvent, { type: 'textDelta' | 'thinkingDelta' }>;

function sameTarget(a: DeltaEvent, b: DeltaEvent): boolean {
  return a.type === b.type && a.threadId === b.threadId && a.messageId === b.messageId;
}

function concatDelta(event: DeltaEvent, extra: string): DeltaEvent {
  return { ...event, delta: event.delta + extra };
}

export function coalesceEvents(events: readonly UiEvent[]): readonly UiEvent[] {
  if (events.length < 2) return events;
  const out: UiEvent[] = [];
  let held: DeltaEvent | null = null;
  const flush = (): void => {
    if (held !== null) {
      out.push(held);
      held = null;
    }
  };
  for (const event of events) {
    if (event.type === 'textDelta' || event.type === 'thinkingDelta') {
      const current: DeltaEvent | null = held;
      if (current !== null && sameTarget(current, event)) {
        held = concatDelta(current, event.delta);
        continue;
      }
      flush();
      held = event;
      continue;
    }
    flush();
    out.push(event);
  }
  flush();
  return out;
}
