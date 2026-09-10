import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PanelDock } from '../panel-dock';

const TABS = [
  { id: 'diff', label: 'Diff' },
  { id: 'agents', label: '子代理' },
];

function render(activeId: string | null): string {
  return renderToStaticMarkup(
    <PanelDock
      tabs={TABS}
      activeId={activeId}
      onSelect={() => undefined}
      onCloseTab={() => undefined}
      onClose={() => undefined}
      closeAria="收起面板"
      closeTabAria={(label) => `关闭 ${label}`}
    >
      <p>pane-content</p>
    </PanelDock>,
  );
}

describe('PanelDock', () => {
  test('渲染全部标签；活跃标签带 aria-current 与激活样式', () => {
    const html = render('agents');
    expect(html).toContain('Diff');
    expect(html).toContain('子代理');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('bg-accent');
    expect(html).toContain('pane-content');
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
  });

  test('单标签关闭钮与整组收起钮的无障碍名就位', () => {
    const html = render('diff');
    expect(html).toContain('aria-label="关闭 Diff"');
    expect(html).toContain('aria-label="关闭 子代理"');
    expect(html).toContain('aria-label="收起面板"');
  });
});
