import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AutocompleteGroupList, canScrollMore, type AutocompleteGroup } from '../autocomplete-group-list';

const GROUPS: readonly AutocompleteGroup[] = [
  {
    id: 'commands',
    title: '命令',
    items: [
      { id: 'prompt:goal', label: '/goal', description: 'Show or set the current session goal.' },
      { id: 'prompt:compact', label: '/compact', description: null },
    ],
  },
  {
    id: 'skills',
    title: '技能',
    items: [{ id: 'skill:writer', label: 'skill:writer', description: null }],
  },
];

function render(groups: readonly AutocompleteGroup[], activeId: string | null = null, extra: { footerHint?: string; scrollDownLabel?: string } = {}): string {
  return renderToStaticMarkup(
    <AutocompleteGroupList
      groups={groups}
      activeId={activeId}
      onSelect={() => undefined}
      onHover={() => undefined}
      ariaLabel="命令建议"
      {...extra}
    />,
  );
}

describe('AutocompleteGroupList 分组面板', () => {
  test('分组渲染：组标题与条目按组序排布（标题先于本组条目）', () => {
    const html = render(GROUPS);
    expect(html).toContain('命令');
    expect(html).toContain('技能');
    expect(html).toContain('/goal');
    expect(html).toContain('Show or set the current session goal.');
    expect(html.indexOf('命令')).toBeLessThan(html.indexOf('/goal'));
    expect(html.indexOf('/goal')).toBeLessThan(html.indexOf('技能'));
    expect(html.indexOf('技能')).toBeLessThan(html.indexOf('skill:writer'));
  });

  test('aria 结构：listbox/group/option 三层；activeId 命中唯一项，其余项未选中', () => {
    const html = render(GROUPS, 'skill:writer');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="group"');
    expect(html.split('aria-selected="true"')).toHaveLength(2);
    expect(html.split('aria-selected="false"')).toHaveLength(3);
  });

  test('空 items 组整组跳过：标题也不渲染', () => {
    const html = render([
      { id: 'commands', title: '命令', items: [{ id: 'prompt:goal', label: '/goal', description: null }] },
      { id: 'skills', title: '技能', items: [] },
    ]);
    expect(html).toContain('/goal');
    expect(html).not.toContain('技能');
  });

  test('全部组为空：不渲染面板', () => {
    expect(render([])).toBe('');
  });

  test('footerHint 提供时渲染提示行；缺省时不渲染底部行', () => {
    const withFooter = render(GROUPS, null, { footerHint: '输入内容以搜索命令或技能', scrollDownLabel: '向下滚动' });
    expect(withFooter).toContain('输入内容以搜索命令或技能');
    const withoutFooter = render(GROUPS);
    expect(withoutFooter).not.toContain('输入内容以搜索命令或技能');
  });
});

describe('canScrollMore 滚动判定', () => {
  test.each([
    ['未滚动且内容超出一屏', 0, 220, 500, true],
    ['滚动到底（含 1px 容差）', 281, 220, 500, false],
    ['滚动到底（精确贴合）', 280, 220, 500, false],
    ['内容不足一屏', 0, 220, 200, false],
    ['内容恰好一屏', 0, 220, 220, false],
    ['零高度容器', 0, 0, 0, false],
  ])('%s', (_name, scrollTop, clientHeight, scrollHeight, expected) => {
    expect(canScrollMore(scrollTop, clientHeight, scrollHeight)).toBe(expected);
  });
});
