import { describe, expect, test } from 'bun:test';

import { classifyFrame, createFrameDecoder } from '../frame-decoder';
import type { HubFrame } from '@paiapp/contracts';

function collect(): { frames: HubFrame[]; dropped: string[]; onFrame: (f: HubFrame) => void } {
  const frames: HubFrame[] = [];
  const dropped: string[] = [];
  return { frames, dropped, onFrame: (f) => frames.push(f) };
}

describe('classifyFrame', () => {
  test.each([
    ['response', { type: 'response', id: '1', command: 'prompt', success: true, data: { x: 1 } }],
    ['event', { type: 'event', threadId: 't1', event: { type: 'message_start' } }],
    ['ui_request', { type: 'ui_request', requestId: 'r1', threadId: 't1', method: 'confirm', title: 'T', message: 'M' }],
    ['heartbeat', { type: 'heartbeat' }],
    ['heartbeat+subagents', { type: 'heartbeat', subagents: 3 }],
    ['heartbeat+resources(v0.13)', { type: 'heartbeat', rssBytes: 123, cpuPercent: 4.5 }],
    ['hub_error', { type: 'hub_error', threadId: 't1', scope: 'worker', error: 'boom' }],
    ['thread_died', { type: 'thread_died', threadId: 't1', reason: 'crash' }],
    ['thread_parked(idle)', { type: 'thread_parked', threadId: 't1', reason: 'idle' }],
    ['thread_parked(manual)', { type: 'thread_parked', threadId: 't1', reason: 'manual' }],
    ['subagent_event', { type: 'subagent_event', threadId: 't1', subagentId: 's1', agent: 'explore', task: 'go', event: { type: 'agent_start' } }],
    ['subagent_message', { type: 'subagent_message', threadId: 't1', subagentId: 's1', agent: 'explore', text: 'hi', to: 's2' }],
  ])('%s 合法形状', (_name, value) => {
    const result = classifyFrame(value);
    expect('frame' in result).toBe(true);
  });

  test.each([
    ['非对象', 'nope'],
    ['数组', [1]],
    ['null', null],
    ['缺 type', { command: 'x' }],
    ['type 非字符串', { type: 3 }],
    ['未知 type', { type: 'mystery' }],
    ['thread_parked 非法 reason', { type: 'thread_parked', threadId: 't1', reason: 'other' }],
  ])('垃圾形状：%s → reason', (_name, value) => {
    const result = classifyFrame(value);
    expect('reason' in result).toBe(true);
  });

  test.each([
    ['event 载荷为 null', { type: 'event', threadId: 't', event: null }],
    ['event 载荷缺 type', { type: 'event', threadId: 't', event: { x: 1 } }],
    ['event 载荷为数组', { type: 'event', threadId: 't', event: [1] }],
    ['subagent_event 载荷为 null', { type: 'subagent_event', threadId: 't', subagentId: 's', agent: 'a', task: 'k', event: null }],
  ])('垃圾事件载荷降级不穿透：%s', (_name, value) => {
    const result = classifyFrame(value);
    expect('reason' in result).toBe(true);
    expect(result).toMatchObject({ reason: expect.stringContaining('frame_payload_invalid') });
  });

  test('合法 event 载荷正常放行', () => {
    const result = classifyFrame({ type: 'event', threadId: 't', event: { type: 'agent_start' } });
    expect('frame' in result).toBe(true);
  });

  test('缺 command 的 response：command 收窄为空串不抛', () => {
    const result = classifyFrame({ type: 'response', success: false });
    expect(result).toEqual({ frame: { type: 'response', id: undefined, command: '', success: false, data: undefined, error: undefined } });
  });
});

describe('createFrameDecoder', () => {
  test('完整行直接解码', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { onDropped: (r) => c.dropped.push(r) });
    decoder.push('{"type":"heartbeat"}\n');
    expect(c.frames).toEqual([{ type: 'heartbeat', subagents: undefined }]);
  });

  test('半行跨 chunk 重组（LF 唯一分隔）', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame);
    decoder.push('{"type":"resp');
    decoder.push('onse","command":"prom');
    decoder.push('pt","success":true}');
    expect(c.frames).toEqual([]);
    decoder.push('\n');
    expect(c.frames.length).toBe(1);
    expect(c.frames[0]).toMatchObject({ type: 'response', command: 'prompt', success: true });
  });

  test('U+2028/U+2029 在 JSON 字符串内不断行（readline 会错切的坑）', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame);
    const text = 'line1line2end';
    decoder.push(`${JSON.stringify({ type: 'heartbeat' })}\n`);
    decoder.push(JSON.stringify({ type: 'event', threadId: 't', event: { type: 'x', text } }));
    decoder.push('\n');
    expect(c.frames.length).toBe(2);
    const event = c.frames[1];
    expect(event).toBeDefined();
    if (event?.type === 'event') {
      expect((event.event as Record<string, unknown>)['text']).toBe(text);
    } else {
      throw new Error('expected event frame');
    }
  });

  test('CRLF 行尾剥 \\r；空行跳过', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame);
    decoder.push('\r\n{"type":"heartbeat"}\r\n\n');
    expect(c.frames.length).toBe(1);
  });

  test('一行多帧按序解码', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame);
    decoder.push('{"type":"heartbeat"}\n{"type":"heartbeat"}\n');
    expect(c.frames.length).toBe(2);
  });

  test('超限整行丢弃且丢弃态到下一个换行才恢复（残余尾巴不误判为新行）', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { maxLineChars: 50, onDropped: (r) => c.dropped.push(r) });
    const huge = 'x'.repeat(120);
    decoder.push(`{"type":"heartbeat"}\n`);
    // 超限行分多个 chunk 到达，且其后还跟着一个合法帧
    decoder.push(`{"pad":"${huge}","tail":"`);
    decoder.push(`${huge}"`);
    decoder.push(`"}\n`);
    decoder.push('{"type":"heartbeat"}\n');
    expect(c.frames.length).toBe(2);
    expect(c.dropped).toEqual(['line_too_long']);
  });

  test('症状回归：跨 chunk 无换行累积同样受上限约束（不再只判单 chunk 增量）', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { maxLineChars: 100, onDropped: (r) => c.dropped.push(r) });
    // 300 个 80 字符 chunk 无换行：单 chunk 判定恒不超限，旧实现的基线重置使
    // buffer 无界增长；真基线（未完成行长度）应在第 2 个 chunk 即进丢弃态
    for (let i = 0; i < 300; i += 1) decoder.push('x'.repeat(80));
    expect(c.dropped).toEqual(['line_too_long']);
    // 丢弃态恢复：后续合法行正常解析
    decoder.push('\n{"type":"heartbeat"}\n');
    expect(c.frames.length).toBe(1);
  });

  test('非 JSON 行丢弃并上报', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { onDropped: (r) => c.dropped.push(r) });
    decoder.push('not json\n');
    expect(c.frames).toEqual([]);
    expect(c.dropped).toEqual(['line_not_json']);
  });

  test('finish 处理无换行尾巴', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame);
    decoder.push('{"type":"heartbeat"}');
    decoder.finish();
    expect(c.frames.length).toBe(1);
  });

  test('finish 丢弃超限尾巴', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { maxLineChars: 10, onDropped: (r) => c.dropped.push(r) });
    decoder.push('x'.repeat(40));
    decoder.finish();
    expect(c.frames).toEqual([]);
    expect(c.dropped).toEqual(['line_too_long']);
  });
});
