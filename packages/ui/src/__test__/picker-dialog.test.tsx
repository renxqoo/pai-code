import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PickerDialog } from '../picker-dialog';
import { PickerDialogItems } from '../picker-dialog-items';
import { Command } from '../command';
import type { PickerDialogGroup } from '../picker-dialog-types';

/** 文案 props 由调用方注入（组件零内置文案）——测试用内联字面量，locale 无关。 */
const TITLE = '选择模型';
const SEARCH_PLACEHOLDER = '搜索模型…';
const EMPTY_LABEL = '没有匹配项';
const NONE_LABEL = '不使用默认模型';

const GROUPS: readonly PickerDialogGroup[] = [
  {
    heading: 'openai',
    items: [
      { id: 'openai/gpt-4o', label: 'gpt-4o' },
      { id: 'openai/gpt-4o-mini', label: 'gpt-4o-mini' },
    ],
  },
  { heading: 'anthropic', items: [{ id: 'anthropic/claude', label: 'claude' }] },
];

const baseProps = {
  title: TITLE,
  searchPlaceholder: SEARCH_PLACEHOLDER,
  emptyLabel: EMPTY_LABEL,
  groups: GROUPS,
  selectedId: null,
  onSelect: () => undefined,
};

/** 列表内容（空态 + 分组条目）须置于 cmdk Command 内才可渲染（依赖其上下文）。 */
function renderItems(groups: readonly PickerDialogGroup[], selectedId: string | null): string {
  return renderToStaticMarkup(
    <Command>
      <PickerDialogItems groups={groups} selectedId={selectedId} emptyLabel={EMPTY_LABEL} onSelect={() => undefined} />
    </Command>,
  );
}

describe('PickerDialog 关态', () => {
  test('关态零渲染：不出现搜索占位/组标题/条目/标题', () => {
    const html = renderToStaticMarkup(<PickerDialog {...baseProps} open={false} onOpenChange={() => undefined} />);
    expect(html).toBe('');
  });
});

describe('PickerDialog 开态（静态可渲染面）', () => {
  test('开态渲染可访问名：sr-only 标题（面板内容经 Portal，SSR 下不落静态 markup）', () => {
    const html = renderToStaticMarkup(<PickerDialog {...baseProps} open={true} onOpenChange={() => undefined} />);
    expect(html).toContain(TITLE);
  });

  test('列表渲染组标题与条目，序为组序；搜索占位不在列表面（属壳层）', () => {
    const html = renderItems(GROUPS, null);
    expect(html).toContain('openai');
    expect(html).toContain('anthropic');
    expect(html).toContain('gpt-4o');
    expect(html).toContain('claude');
    expect(html.indexOf('openai')).toBeLessThan(html.indexOf('gpt-4o'));
    expect(html.indexOf('gpt-4o-mini')).toBeLessThan(html.indexOf('anthropic'));
    expect(html).not.toContain(SEARCH_PLACEHOLDER);
  });

  test('selectedId 命中唯一勾（自绘 Check size-3.5），未命中/为 null 时无勾', () => {
    expect(renderItems(GROUPS, 'anthropic/claude').split('size-3.5')).toHaveLength(2);
    expect(renderItems(GROUPS, 'missing/model').split('size-3.5')).toHaveLength(1);
    expect(renderItems(GROUPS, null).split('size-3.5')).toHaveLength(1);
  });

  test('勾的显隐契约：每个条目带 svg:last-child 隐藏选择器，选中项自绘勾不是末位 svg（被藏的恒是生成物 CheckIcon）', () => {
    const html = renderItems(GROUPS, 'anthropic/claude');
    // 生成物 CheckIcon 恒排 children 末位，ITEM_CLASS_NAME 的隐藏选择器挂在条目上
    expect(html).toContain('svg:last-child]:hidden');
    // 自绘勾（size-3.5）之后还存在后续 <svg（生成物 CheckIcon），即被藏的不是自绘勾
    const checkAt = html.indexOf('size-3.5');
    const lastSvgAt = html.lastIndexOf('<svg');
    expect(checkAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(lastSvgAt);
  });

  test('条目访问名补全完整 id（展示 label 已去 provider 前缀）', () => {
    const html = renderItems(GROUPS, null);
    expect(html).toContain('aria-label="openai/gpt-4o"');
    expect(html).toContain('aria-label="anthropic/claude"');
  });

  test('sentinel 组与无标题模型组共存：保留 id 与真实模型 id 各归其位，勾落在命中项', () => {
    const groups: readonly PickerDialogGroup[] = [
      { items: [{ id: '__none__', label: NONE_LABEL }] },
      { items: [{ id: 'bare-model', label: 'bare-model' }] },
    ];
    const html = renderItems(groups, 'bare-model');
    expect(html).toContain(NONE_LABEL);
    expect(html).toContain('bare-model');
    expect(html.split('size-3.5')).toHaveLength(2);
  });

  test('空 items 组整组跳过：标题也不渲染', () => {
    const html = renderItems(
      [{ heading: 'ghost', items: [] }, { heading: 'openai', items: [{ id: 'openai/gpt-4o', label: 'gpt-4o' }] }],
      null,
    );
    expect(html).toContain('gpt-4o');
    expect(html).not.toContain('ghost');
  });

  test('groups 全空：渲染空态文案', () => {
    const html = renderItems([], null);
    expect(html).toContain(EMPTY_LABEL);
  });
});
