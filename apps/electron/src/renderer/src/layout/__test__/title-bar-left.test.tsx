import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TitleBarLeft } from '../title-bar-left';

/**
 * 回归（症状：侧栏开关「图标坏了」）：曾用带箭头的 panel-left-open/close
 * 变体，按钮内 svg 仅 16px，箭头在该尺寸下退化为不可辨的折线脏斑。
 * 锁定两态共用无箭头的 panel-left 单一图形，状态语义交给 aria-expanded
 * 与装配层随状态切换的 tooltip 文案。
 */
function renderTitleBar(collapsed: boolean): string {
  return renderToStaticMarkup(
    <TitleBarLeft
      titleName="Pai"
      titleSuffix="Code"
      toggleLabel={collapsed ? '展开侧栏' : '收起侧栏'}
      collapsed={collapsed}
      sidebarWidth={240}
      onToggle={() => {}}
    />,
  );
}

function svgOf(html: string): string {
  const match = /<svg[^>]*>.*?<\/svg>/.exec(html);
  if (match === null) throw new Error('sidebar toggle svg not found in rendered markup');
  return match[0];
}

describe('TitleBarLeft 侧栏开关', () => {
  test('两态图标同形：均为无箭头 panel-left（箭头变体 16px 下退化为脏斑）', () => {
    const collapsedHtml = renderTitleBar(true);
    const expandedHtml = renderTitleBar(false);
    for (const html of [collapsedHtml, expandedHtml]) {
      expect(html).toContain('lucide-panel-left"');
      expect(html).not.toContain('panel-left-open');
      expect(html).not.toContain('panel-left-close');
    }
    expect(svgOf(collapsedHtml)).toBe(svgOf(expandedHtml));
  });

  test('状态语义：aria-expanded 随收起态翻转，tooltip 采用装配层文案', () => {
    expect(renderTitleBar(true)).toContain('aria-expanded="false"');
    expect(renderTitleBar(true)).toContain('title="展开侧栏"');
    expect(renderTitleBar(false)).toContain('aria-expanded="true"');
    expect(renderTitleBar(false)).toContain('title="收起侧栏"');
  });

  test('标题块渲染应用名与后缀，展开态宽度钳制在侧栏内', () => {
    const html = renderTitleBar(false);
    expect(html).toContain('Pai');
    expect(html).toContain('Code');
    expect(html).toContain('max-width:240px');
  });
});
