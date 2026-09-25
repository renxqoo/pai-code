import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CollapsibleSection } from '../collapsible-section';

describe('CollapsibleSection', () => {
  const noop = (): void => {};

  test('展开渲染内容 + aria-expanded=true', () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection open onOpenChange={noop} title="进程">
        <p>批次 A</p>
      </CollapsibleSection>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('批次 A');
    expect(html).toContain('进程');
  });

  test('收起卸载内容（不留不可见可聚焦元素）', () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection open={false} onOpenChange={noop} title="智能体">
        <button type="button">不该出现</button>
      </CollapsibleSection>,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('不该出现');
    expect(html).not.toContain('<div');
  });

  test('icon 与 meta 插槽渲染；缺省不渲染占位', () => {
    const withSlots = renderToStaticMarkup(
      <CollapsibleSection open onOpenChange={noop} title="进程" icon={<span>ICON</span>} meta={<span>5/5</span>}>
        <div>x</div>
      </CollapsibleSection>,
    );
    expect(withSlots).toContain('5/5');
    expect(withSlots).toContain('ICON');
    const without = renderToStaticMarkup(
      <CollapsibleSection open={false} onOpenChange={noop} title="进程">
        <div>x</div>
      </CollapsibleSection>,
    );
    expect(without).not.toContain('ICON');
    expect(without).not.toContain('5/5');
  });
});
