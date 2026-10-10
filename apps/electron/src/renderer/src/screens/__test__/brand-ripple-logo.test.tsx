import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { BrandRippleLogo } from '../brand-ripple-logo';

/** 启动页 logo + 水波纹（启动态无文字，靠涟漪表达进行中）。 */

describe('启动页 BrandRippleLogo', () => {
  test('渲染 logo 图与两道错相的波纹环', () => {
    const html = renderToStaticMarkup(<BrandRippleLogo size={96} />);
    expect(html).toContain('logo-ripple-stage');
    expect(html.match(/logo-ripple-ring/g)?.length ?? 0).toBe(2);
    expect(html).toContain('x3code-logo.png');
  });

  test('尺寸透传到 logo 与水波纹层（启动页大图不糊）', () => {
    const html = renderToStaticMarkup(<BrandRippleLogo size={120} />);
    expect(html).toContain('width="120"');
    expect(html).toContain('height="120"');
    expect(html).toContain('--logo-size:120px');
    expect(html).toContain('width:228px');
  });

  test('logo 对装饰层隐藏语义（启动页无信息可朗读，不污染读屏）', () => {
    const html = renderToStaticMarkup(<BrandRippleLogo />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
  });

test('症状回归：外层不得裁剪水波纹——环扩散到 1.85 倍需容器留出空间，否则涟漪不可见', () => {
    const html = renderToStaticMarkup(<BrandRippleLogo size={100} />);
    // 100 * 1.9 留出 1.85 倍扩散余量；overflow hidden 会把环切掉只剩 logo 内圈
    expect(html).toContain('width:190px');
    expect(html).not.toContain('overflow');
  });
});
