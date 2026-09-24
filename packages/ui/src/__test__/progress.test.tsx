import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Progress } from '../progress';

describe('环形进度静态渲染', () => {
  test('底环 + 已完成弧段，弧长随 value 比例', () => {
    const html = renderToStaticMarkup(<Progress value={50} />);
    expect(html.match(/<circle/g)?.length).toBe(2);
    expect(html).toContain('stroke-dasharray="23.56 47.12"');
    expect(html).toContain('width="16"');
    expect(html).toContain('role="img"');
    expect(html).toContain('shrink-0');
  });

  test('value 超区间按边界钳制（150 → 满环，-5 → 空环）', () => {
    expect(renderToStaticMarkup(<Progress value={150} />)).toContain('stroke-dasharray="47.12 47.12"');
    expect(renderToStaticMarkup(<Progress value={-5} />)).toContain('stroke-dasharray="0.00 47.12"');
  });

  test('size 透传，className 合并进 svg', () => {
    const html = renderToStaticMarkup(<Progress value={10} size={24} className="text-destructive" />);
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
    expect(html).toContain('text-destructive');
  });
});
