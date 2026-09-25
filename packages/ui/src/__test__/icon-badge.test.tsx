import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { IconBadge } from '../icon-badge';

describe('IconBadge', () => {
  test('图标按钮 + 右上角数字徽标', () => {
    const html = renderToStaticMarkup(
      <IconBadge count={2} label="工作中 2 个子代理">
        <svg />
      </IconBadge>,
    );
    expect(html).toContain('aria-label="工作中 2 个子代理"');
    expect(html).toContain('>2<');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('bg-link');
  });

  test('count<=0 不渲染徽标（按钮本体照常）', () => {
    const html = renderToStaticMarkup(
      <IconBadge count={0} label="工作中 0 个子代理">
        <svg />
      </IconBadge>,
    );
    expect(html).toContain('aria-label="工作中 0 个子代理"');
    expect(html).not.toContain('bg-link');
  });
});
