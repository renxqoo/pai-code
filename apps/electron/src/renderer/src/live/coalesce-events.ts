import type { UiEvent } from '@paiapp/contracts';

/**
 * 50ms 批内相邻同类 delta 折叠：同线程同消息的连续 text/thinking delta 拼接为一条，
 * 同线程同调用的连续 tool 输出拼接为一条——store 每批每块至多折叠一次（消灭批内
 * 逐条 set 的重复全量拷贝与字符串拼接；chatty 工具输出与打字机同型受益）。
 * 仅折叠「相邻」事件：批本身有序，不重排、不跨事件类合并；
 * 其余事件原样透传——批语义与逐条投递等价（批内中间态本就不产生可见渲染）。
 */

type DeltaEvent = Extract<UiEvent, { type: 'textDelta' | 'thinkingDelta' }>;
type ToolDeltaEvent = Extract<UiEvent, { type: 'toolUpdated' }>;

function sameTarget(a: DeltaEvent, b: DeltaEvent): boolean {
  return a.type === b.type && a.threadId === b.threadId && a.messageId === b.messageId;
}

function concatDelta(event: DeltaEvent, extra: string): DeltaEvent {
  return { ...event, delta: event.delta + extra };
}

function sameCall(a: ToolDeltaEvent, b: ToolDeltaEvent): boolean {
  return a.threadId === b.threadId && a.callId === b.callId;
}

function concatToolOutput(event: ToolDeltaEvent, extra: string): ToolDeltaEvent {
  return { ...event, output: event.output + extra };
}

export function coalesceEvents(events: readonly UiEvent[]): readonly UiEvent[] {
  if (events.length < 2) return events;
  const out: UiEvent[] = [];
  let held: DeltaEvent | null = null;
  let heldTool: ToolDeltaEvent | null = null;
  const flushDelta = (): void => {
    if (held !== null) {
      out.push(held);
      held = null;
    }
  };
  const flushTool = (): void => {
    if (heldTool !== null) {
      out.push(heldTool);
      heldTool = null;
    }
  };
  for (const event of events) {
    if (event.type === 'textDelta' || event.type === 'thinkingDelta') {
      flushTool();
      const current: DeltaEvent | null = held;
      if (current !== null && sameTarget(current, event)) {
        held = concatDelta(current, event.delta);
        continue;
      }
      flushDelta();
      held = event;
      continue;
    }
    if (event.type === 'toolUpdated') {
      flushDelta();
      if (heldTool !== null && sameCall(heldTool, event)) {
        heldTool = concatToolOutput(heldTool, event.output);
        continue;
      }
      flushTool();
      heldTool = event;
      continue;
    }
    flushDelta();
    flushTool();
    out.push(event);
  }
  flushDelta();
  flushTool();
  return out;
}
