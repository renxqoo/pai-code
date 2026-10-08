import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';

/** llm/retry 帧映射：坐标校验、垃圾帧丢弃与结算水位（迟到帧）守卫。 */

const deps = { now: () => 1_000 };

type Frame = { threadId: string; name: string; payload: Record<string, unknown> };

function frame(name: string, payload: Record<string, unknown>): Frame {
  return { threadId: 't', name, payload };
}

describe('createEventMapper · llm/retry', () => {
  test('合法帧 → retrying（attempt 序号 + turn/step 归属 + code/message 分开传）', () => {
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { turn: 3, step: 0, retry: 2, failure: { message: 'rate limited', code: 'http-429' } }))).toEqual([
      { type: 'retrying', threadId: 't', turn: 3, step: 0, attempt: 2, code: 'http-429', message: 'rate limited' },
    ]);
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { turn: 3, step: 0, retry: 1, failure: { code: 'network' } }))).toEqual([
      { type: 'retrying', threadId: 't', turn: 3, step: 0, attempt: 1, code: 'network', message: null },
    ]);
    // 空 failure / 缺字段：code 与 message 各自落 null，不拼出半个串（界面按 code 出人话，缺失即兜底文案）
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { turn: 0, step: 0, retry: 1 }))).toEqual([
      { type: 'retrying', threadId: 't', turn: 0, step: 0, attempt: 1, code: null, message: null },
    ]);
  });

  test('帧缺轮步坐标/序号非正（垃圾帧）不产事件（hub gates 保证线上帧坐标恒在；垃圾输入丢弃，不降级续传）', () => {
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { retry: 1, failure: { message: 'x' } }))).toEqual([]);
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { turn: 3, step: 0, failure: { message: 'x' } }))).toEqual([]);
    expect(createEventMapper(deps).mapEvent(frame('llm/retry', { turn: 3, step: 0, retry: 0, failure: { message: 'x' } }))).toEqual([]);
  });

  test('迟到帧（结算轮水位以下）不产事件（与 llm/chunk 同判据）', () => {
    const mapper = createEventMapper(deps);
    // 轮 1 流式后结算（settled 帧无轮号：水位取流缓冲轮号）
    mapper.mapEvent(frame('llm/chunk', { turn: 1, step: 0, chunk: { type: 'text-delta', text: 'x' } }));
    mapper.mapEvent(frame('settled', { ok: true }));
    expect(mapper.mapEvent(frame('llm/retry', { turn: 1, step: 0, retry: 1, failure: { message: 'late' } }))).toEqual([]);
    // 新轮开启清除水位：当前轮的重试帧照常产出
    mapper.mapEvent(frame('turn/start', { time: 2 }));
    expect(mapper.mapEvent(frame('llm/retry', { turn: 2, step: 0, retry: 1, failure: { message: 'x' } }))).toEqual([
      { type: 'retrying', threadId: 't', turn: 2, step: 0, attempt: 1, code: null, message: 'x' },
    ]);
  });
});
