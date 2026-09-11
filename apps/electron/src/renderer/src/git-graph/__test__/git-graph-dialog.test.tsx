import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GitGraphCommit } from '@paiapp/contracts';

import { GitGraphBodyStatus } from '../git-graph-status';
import { GitGraphDialog } from '../git-graph-dialog';
import { GitGraphRow } from '../git-graph-row';
import { GitGraphTableHeader } from '../git-graph-table-header';
import { buildGraphLayouts } from '../graph-layout';
import { copy } from '@/strings';

/**
 * 图谱弹窗呈现面（SSR 口径，同 PickerDialog 惯例——Portal 壳的挂载时序不进单测，
 * 交真机走查；此处断言壳渲染不抛错 + 内组件逐面）：
 * 表头五列 / 行内容（pill·merge 标记·短哈希·日期）/ 三态 / 截断尾注。
 */

function commit(overrides: Partial<GitGraphCommit> = {}): GitGraphCommit {
  return {
    hash: 'h1',
    shortHash: 'h123456',
    subject: 'feat: something',
    author: 'pai',
    timestamp: new Date(2026, 8, 12, 3, 4).getTime() / 1000,
    parents: [],
    refs: [],
    isHead: false,
    ...overrides,
  };
}

describe('GitGraphTableHeader', () => {
  test('五列表头文案', () => {
    const html = renderToStaticMarkup(<GitGraphTableHeader />);
    for (const label of [copy.gitGraph.colGraph, copy.gitGraph.colDescription, copy.gitGraph.colDate, copy.gitGraph.colAuthor, copy.gitGraph.colCommit]) {
      expect(html).toContain(label);
    }
  });
});

describe('GitGraphRow', () => {
  test('HEAD 行：HEAD pill + 分支 pill + 主题 + 日期 + 作者 + 短哈希；merge 行带双亲连边', () => {
    const head = commit({ hash: 'm', shortHash: 'mmerge1', subject: 'merge dev', refs: ['HEAD -> main'], isHead: true, parents: ['a', 'b'] });
    const root = commit({ hash: 'a', shortHash: 'aaaaaaa', subject: 'init' });
    const layouts = buildGraphLayouts([head, root]);
    const headLayout = layouts[0];
    const rootLayout = layouts[1];
    if (headLayout === undefined || rootLayout === undefined) throw new Error('layouts missing');
    const html = renderToStaticMarkup(
      <div>
        <GitGraphRow commit={head} layout={headLayout} laneCount={2} isLast={false} />
        <GitGraphRow commit={root} layout={rootLayout} laneCount={1} isLast />
      </div>,
    );
    expect(html).toContain(copy.gitGraph.headLabel);
    expect(html).toContain('main');
    expect(html).toContain('merge dev');
    expect(html).toContain('init');
    expect(html).toContain('pai');
    expect(html).toContain('aaaaaaa');
    expect(html).toContain('09/12 03:04');
    // 每行一个泳道 SVG（宽 ≥85 的是泳道图，lucide 图标不以此宽度出现）
    expect(html.match(/<svg width="(?:8[5-9]|\d{2,})"/g)?.length).toBe(2);
  });
});

describe('GitGraphBodyStatus', () => {
  test('三态文案：loading / unavailable / empty', () => {
    expect(renderToStaticMarkup(<GitGraphBodyStatus status="loading" />)).toContain(copy.gitGraph.loading);
    expect(renderToStaticMarkup(<GitGraphBodyStatus status="unavailable" />)).toContain(copy.gitGraph.unavailable);
    expect(renderToStaticMarkup(<GitGraphBodyStatus status="empty" />)).toContain(copy.gitGraph.empty);
  });
});

describe('GitGraphDialog（壳冒烟）', () => {
  test('开/关两态与空数据渲染不抛错（呈现断言在上列内组件；截断尾注文案进 dialog 壳路径）', () => {
    const ready = renderToStaticMarkup(
      <GitGraphDialog
        open
        onOpenChange={() => undefined}
        view={{ isRepo: true, truncated: true, commits: [commit({ hash: 'x', shortHash: 'x123456', subject: 'only' })] }}
        loading={false}
        failed={false}
        onRefresh={() => undefined}
      />,
    );
    expect(typeof ready).toBe('string');
    const loading = renderToStaticMarkup(
      <GitGraphDialog open onOpenChange={() => undefined} view={null} loading failed={false} onRefresh={() => undefined} />,
    );
    expect(typeof loading).toBe('string');
    const closed = renderToStaticMarkup(
      <GitGraphDialog open={false} onOpenChange={() => undefined} view={null} loading={false} failed={false} onRefresh={() => undefined} />,
    );
    expect(closed).not.toContain(copy.gitGraph.title);
  });
});
