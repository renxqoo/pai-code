import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FloatingPanel } from '../floating-panel';

describe('FloatingPanel', () => {
  test('面板外观 token + 可访问名 + 标题', () => {
    const html = renderToStaticMarkup(
      <FloatingPanel label="速览面板" title="速览">
        <p>内容</p>
      </FloatingPanel>,
    );
    expect(html).toContain('aria-label="速览面板"');
    expect(html).toContain('rounded-2xl');
    expect(html).toContain('border-border');
    expect(html).toContain('bg-popover');
    expect(html).toContain('shadow-lg');
    expect(html).toContain('速览');
    expect(html).toContain('内容');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('overflow-y-auto');
  });

  test('maxContentHeight 落内容区内滚（缺省不限高）', () => {
    const capped = renderToStaticMarkup(
      <FloatingPanel label="a" title="t" maxContentHeight={360}>
        <p>x</p>
      </FloatingPanel>,
    );
    expect(capped).toContain('max-height:360px');
    const free = renderToStaticMarkup(
      <FloatingPanel label="a" title="t">
        <p>x</p>
      </FloatingPanel>,
    );
    expect(free).not.toContain('max-height');
  });

  test('标题栏动作插槽渲染', () => {
    const html = renderToStaticMarkup(
      <FloatingPanel label="a" title="t" actions={<button type="button">收起</button>}>
        <p>x</p>
      </FloatingPanel>,
    );
    expect(html).toContain('收起');
  });

  test('底部固定条渲染（不随内容滚动；缺省无）', () => {
    const html = renderToStaticMarkup(
      <FloatingPanel label="a" title="t" footer={<div>运行中 1</div>}>
        <p>x</p>
      </FloatingPanel>,
    );
    expect(html).toContain('运行中 1');
    expect(html).toContain('shrink-0 border-t');
    const without = renderToStaticMarkup(
      <FloatingPanel label="a" title="t">
        <p>x</p>
      </FloatingPanel>,
    );
    expect(without).not.toContain('border-t');
  });
});
