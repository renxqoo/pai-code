import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TickerTrack, tickerDurationSeconds } from '../ticker-track';

describe('tickerDurationSeconds 时长折算', () => {
  test('短文本抬到下限、长文本压到上限，中间线性定速', () => {
    expect(tickerDurationSeconds('')).toBe(6);
    expect(tickerDurationSeconds('x'.repeat(18))).toBe(6);
    expect(tickerDurationSeconds('x'.repeat(180))).toBe(10);
    expect(tickerDurationSeconds('x'.repeat(1800))).toBe(30);
  });
});

describe('TickerTrack 滑动轨', () => {
  test('双份同文本等宽排列构成无缝循环，本体对读屏隐藏', () => {
    const html = renderToStaticMarkup(<TickerTrack text="思考内容" durationSeconds={6} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ticker-track');
    expect(html.split('思考内容')).toHaveLength(3);
  });

  test('时长内联注入动画样式', () => {
    const html = renderToStaticMarkup(<TickerTrack text="思考内容" durationSeconds={12.5} />);
    expect(html).toContain('animation-duration:12.5s');
  });
});
