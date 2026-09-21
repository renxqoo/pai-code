/**
 * 红测：frame-decoder 超限行丢弃殃及同 chunk 内后续完整帧。
 *
 * 契约（frame-decoder.ts 头注释）：「单行超过上限**整行**丢弃并上报」——只丢那一行。
 * 实现：push 在行提取前做整体预判（buffer.length - scanned > maxLineChars 即
 * enterDiscarding 并 return），把同一 chunk 中超限行之后的所有完整帧一并丢弃，
 * 且在等待未来 chunk 的下一个 \n 期间继续丢弃——违背「整行丢弃」的边界。
 */
import { expect, test } from 'bun:test';

import { createFrameDecoder } from '../frame-decoder';

test('BUG: 超限行丢弃时同 chunk 内其后的完整合法帧被一并丢弃', () => {
  const frames: Array<{ type: string }> = [];
  const dropped: string[] = [];
  const decoder = createFrameDecoder(
    (frame) => {
      frames.push(frame as { type: string });
    },
    { maxLineChars: 20, onDropped: (reason) => dropped.push(reason) },
  );
  const overlong = 'x'.repeat(21); // 超限行本体
  const valid = JSON.stringify({ type: 'heartbeat' }); // 同批的合法帧
  decoder.push(`${overlong}\n${valid}\n`);
  // 只允许丢超限行；heartbeat 必须交付
  expect(frames.length).toBe(1);
  expect(frames[0]?.type).toBe('heartbeat');
  expect(dropped).toEqual(['line_too_long']);
});
