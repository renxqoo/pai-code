import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DiffStat } from '../diff-stat';

describe('DiffStat', () => {
  test('双边计数（+N −M 着色等宽）', () => {
    const html = renderToStaticMarkup(<DiffStat additions={739} deletions={290} />);
    expect(html).toContain('+739');
    expect(html).toContain('-290');
    expect(html).toContain('text-diff-add');
    expect(html).toContain('text-diff-del');
    expect(html).toContain('tabular-nums');
  });

  test('0 值侧隐藏（单边显示）', () => {
    const addOnly = renderToStaticMarkup(<DiffStat additions={3} deletions={0} />);
    expect(addOnly).toContain('+3');
    expect(addOnly).not.toContain('text-diff-del');
    const delOnly = renderToStaticMarkup(<DiffStat additions={0} deletions={4} />);
    expect(delOnly).toContain('-4');
    expect(delOnly).not.toContain('text-diff-add');
  });

  test('全 0 渲染空槽（布局稳定、无数字）', () => {
    const html = renderToStaticMarkup(<DiffStat additions={0} deletions={0} />);
    expect(html).not.toContain('text-diff-add');
    expect(html).not.toContain('text-diff-del');
    expect(html).not.toContain('0');
  });

  test('k 位计数走同一计数形态（+34k / -16k）', () => {
    const html = renderToStaticMarkup(<DiffStat additions={34_000} deletions={16_000} />);
    expect(html).toContain('+34k');
    expect(html).toContain('-16k');
  });

  test('className 合并', () => {
    expect(renderToStaticMarkup(<DiffStat additions={1} deletions={1} className="text-lg" />)).toContain('text-lg');
  });
});
