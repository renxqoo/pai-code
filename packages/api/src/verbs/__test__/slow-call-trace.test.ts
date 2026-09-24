import { describe, expect, test } from 'bun:test';

import { slowCallTrace } from '../slow-call-trace';

describe('慢命令诊断行（症状：「发送卡顿」复现无定位手段——hub_call_slow 落点）', () => {
  test('未达阈值不落（null）；达阈值带 threadId 定位会话', () => {
    expect(slowCallTrace({ type: 'prompt', threadId: 't1', message: 'hi' }, 499, 500)).toBeNull();
    expect(slowCallTrace({ type: 'prompt', threadId: 't1', message: 'hi' }, 500, 500)).toBe('hub_call_slow:prompt:t1:500ms');
  });

  test('无 threadId 的命令落 -（与 hub_call_rejected 同口径）', () => {
    expect(slowCallTrace({ type: 'thread/list' }, 900, 500)).toBe('hub_call_slow:thread/list:-:900ms');
  });
});
