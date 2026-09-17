import { describe, expect, test } from 'bun:test';

import { classifyFrame, createFrameDecoder } from '../frame-decoder';
import type { HubFrame } from '@paiapp/contracts';

function collect(): { frames: HubFrame[]; dropped: string[]; onFrame: (f: HubFrame) => void } {
  const frames: HubFrame[] = [];
  const dropped: string[] = [];
  return { frames, dropped, onFrame: (f) => frames.push(f) };
}

describe('classifyFrame · 七帧分类', () => {
  test.each([
    ['response', { type: 'response', id: '1', command: 'prompt', success: true, data: { x: 1 } }],
    ['event', { type: 'event', threadId: 't1', name: 'assistant/stream', payload: { type: 'text', text: 'hi' } }],
    ['event(子代理中继)', { type: 'event', threadId: 't1', name: 'assistant/stream', payload: { type: 'text', text: 'hi' }, agentName: 'explore' }],
    ['ui_request', { type: 'ui_request', requestId: 'r1', threadId: 't1', method: 'confirm', tool: 'bash', summary: 's' }],
    ['heartbeat', { type: 'heartbeat' }],
    ['heartbeat(资源位)', { type: 'heartbeat', rssBytes: 123, cpuPercent: 4.5 }],
    ['hub_error', { type: 'hub_error', threadId: 't1', message: 'boom' }],
    ['thread_died', { type: 'thread_died', threadId: 't1', reason: 'crash' }],
    ['thread_parked(idle)', { type: 'thread_parked', threadId: 't1', reason: 'idle' }],
    ['thread_parked(manual)', { type: 'thread_parked', threadId: 't1', reason: 'manual' }],
    ['thread_parked(rss)', { type: 'thread_parked', threadId: 't1', reason: 'rss' }],
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
    ['subagent_event（旧协议帧已摘除）', { type: 'subagent_event', threadId: 't1', agentName: 'explore', event: { name: 'x' } }],
    ['subagent_message（旧协议帧已摘除）', { type: 'subagent_message', threadId: 't1', agentName: 'explore', text: 'hi' }],
    ['thread_parked 非法 reason', { type: 'thread_parked', threadId: 't1', reason: 'other' }],
  ])('垃圾形状：%s → reason', (_name, value) => {
    const result = classifyFrame(value);
    expect('reason' in result).toBe(true);
  });

  test('subagent_* 帧归类 frame_type_unknown（前缀带原 type 名）', () => {
    expect(classifyFrame({ type: 'subagent_event' })).toEqual({ reason: 'frame_type_unknown:subagent_event' });
    expect(classifyFrame({ type: 'subagent_message' })).toEqual({ reason: 'frame_type_unknown:subagent_message' });
  });

  test.each([
    ['event 载荷为 null', { type: 'event', threadId: 't', name: 'assistant/stream', payload: null }],
    ['event 载荷为数组', { type: 'event', threadId: 't', name: 'assistant/stream', payload: [1] }],
    ['event 载荷为字符串', { type: 'event', threadId: 't', name: 'assistant/stream', payload: 'x' }],
  ])('垃圾事件载荷降级不穿透：%s', (_name, value) => {
    const result = classifyFrame(value);
    expect('reason' in result).toBe(true);
    expect(result).toMatchObject({ reason: expect.stringContaining('frame_payload_invalid') });
  });

  test('event 帧收窄：name/payload 展开、agentName 可选不携带', () => {
    const plain = classifyFrame({ type: 'event', threadId: 't', name: 'tool/result', payload: { toolUseId: 'c1' } });
    expect(plain).toEqual({ frame: { type: 'event', threadId: 't', name: 'tool/result', payload: { toolUseId: 'c1' } } });
    const relay = classifyFrame({ type: 'event', threadId: 't', name: 'tool/result', payload: {}, agentName: 'explore' });
    expect(relay).toEqual({ frame: { type: 'event', threadId: 't', name: 'tool/result', payload: {}, agentName: 'explore' } });
  });

  test('ui_request 帧收窄：confirm 载荷平铺透传（rest 字段）', () => {
    const result = classifyFrame({ type: 'ui_request', requestId: 'r1', threadId: 't1', method: 'confirm', tool: 'bash', summary: 'npm test', reason: 'net' });
    expect(result).toEqual({
      frame: { type: 'ui_request', requestId: 'r1', threadId: 't1', method: 'confirm', tool: 'bash', summary: 'npm test', reason: 'net' },
    });
  });

  test('response 缺 command：收窄空串不抛；success 仅 true 为真', () => {
    const result = classifyFrame({ type: 'response', success: false });
    expect(result).toEqual({ frame: { type: 'response', id: undefined, command: '', success: false, data: undefined, error: undefined } });
  });

  test('hub_error：threadId 可选、message 收窄字符串', () => {
    expect(classifyFrame({ type: 'hub_error', message: 'm' })).toEqual({ frame: { type: 'hub_error', threadId: undefined, message: 'm' } });
  });

  test('heartbeat：资源位非有限数收窄 undefined', () => {
    expect(classifyFrame({ type: 'heartbeat', rssBytes: 'x', cpuPercent: Number.NaN })).toEqual({
      frame: { type: 'heartbeat', rssBytes: undefined, cpuPercent: undefined },
    });
  });
});

describe('createFrameDecoder · 分帧器', () => {
  test('完整行直接解码', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { onDropped: (r) => c.dropped.push(r) });
    decoder.push('{"type":"heartbeat"}\n');
    expect(c.frames).toEqual([{ type: 'heartbeat' }]);
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
    decoder.push(JSON.stringify({ type: 'event', threadId: 't', name: 'assistant/stream', payload: { type: 'text', text } }));
    decoder.push('\n');
    expect(c.frames.length).toBe(2);
    const event = c.frames[1];
    expect(event).toBeDefined();
    if (event?.type === 'event') {
      expect(event.payload['text']).toBe(text);
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
    decoder.push('{"type":"heartbeat"}\n{"type":"hub_error","message":"m"}\n');
    expect(c.frames.length).toBe(2);
    expect(c.frames[1]).toMatchObject({ type: 'hub_error', message: 'm' });
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

  test('非 JSON 行丢弃并上报；未知帧分类 reason 上报（解码继续）', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { onDropped: (r) => c.dropped.push(r) });
    decoder.push('not json\n');
    decoder.push('{"type":"mystery"}\n');
    decoder.push('{"type":"heartbeat"}\n');
    expect(c.frames).toEqual([{ type: 'heartbeat' }]);
    expect(c.dropped).toEqual(['line_not_json', 'frame_type_unknown:mystery']);
  });

  test('丢弃态恢复后的残余若含完整超限行：行级防线兜底丢弃，后续行不受影响', () => {
    const c = collect();
    const decoder = createFrameDecoder(c.onFrame, { maxLineChars: 20, onDropped: (r) => c.dropped.push(r) });
    // 触发丢弃态（跨 chunk 超限）
    decoder.push(`${'x'.repeat(40)}partial`);
    // 恢复 chunk：换行后的残余里带着一条完整超限行 + 一条合法行
    decoder.push(`\n${'y'.repeat(30)}\n{"type":"heartbeat"}\n`);
    expect(c.frames).toEqual([{ type: 'heartbeat' }]);
    expect(c.dropped).toEqual(['line_too_long', 'line_too_long']);
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
