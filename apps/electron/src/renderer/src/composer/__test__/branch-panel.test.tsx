import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { GitBranchesView } from '@paiapp/contracts';

import { BranchPanel, filterBranches } from '../branch-panel';
import { render } from '@/testing/render';
import { copy } from '@/strings';

/**
 * 分支面板内容件：当前分支勾选 + 脏计数副文本只在当前行、搜索过滤、
 * 三态空文案（loading/failed/过滤无结果）、busy 禁用、动作回调。
 */

const VIEW: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 42 };

function panel(overrides: Partial<Parameters<typeof BranchPanel>[0]>): React.ReactElement {
  return (
    <BranchPanel
      view={VIEW}
      loading={false}
      failed={false}
      busy={false}
      onSelect={() => undefined}
      onCreate={() => undefined}
      onOpenGraph={() => undefined}
      {...overrides}
    />
  );
}

describe('BranchPanel', () => {
  test('分支行渲染：当前分支勾选 + 脏计数副文本只在当前行', () => {
    const page = render(panel({}));
    const text = page.container.textContent ?? '';
    expect(text).toContain('main');
    expect(text).toContain('dev');
    expect(text).toContain(copy.branch.dirtyFiles(42));
    const rows = [...page.container.querySelectorAll('button')];
    const mainRow = rows.find((b) => b.textContent?.startsWith('main'));
    expect(mainRow?.getAttribute('aria-current')).toBe('true');
    // 当前行图标两枚（分支图标 + 勾选），非当前行只有分支图标
    expect(mainRow?.querySelectorAll('svg').length).toBe(2);
    const devRow = rows.find((b) => b.textContent?.startsWith('dev'));
    expect(devRow?.querySelectorAll('svg').length).toBe(1);
    expect(devRow?.textContent).not.toContain(copy.branch.dirtyFiles(42));
    page.unmount();
  });

  test('干净工作区（dirtyFiles=0）不渲染副文本', () => {
    const page = render(panel({ view: { ...VIEW, dirtyFiles: 0 } }));
    expect(page.container.textContent).not.toContain(copy.branch.dirtyFiles(0));
    expect(page.container.textContent).not.toContain('未提交的更改');
    page.unmount();
  });

  test('detached HEAD（current=null）：脏计数升为分组标题下的置顶弱提示（当前行缺失但有数字可看）', () => {
    const page = render(panel({ view: { isRepo: true, current: null, branches: ['dev', 'main'], dirtyFiles: 3 } }));
    expect(page.container.textContent).toContain(copy.branch.dirtyFiles(3));
    // 无当前行：没有任何行打勾
    expect(page.container.querySelector('button[aria-current="true"]')).toBeNull();
    page.unmount();
  });

  test('搜索过滤（filterBranches 表驱动）：大小写不敏感、空词全量、无命中空列表', () => {
    const branches = ['Dev', 'feature/x', 'main', 'RELEASE-1'];
    expect(filterBranches(branches, '')).toEqual(branches);
    expect(filterBranches(branches, '  ')).toEqual(branches);
    expect(filterBranches(branches, 'dev')).toEqual(['Dev']);
    expect(filterBranches(branches, 'DEV')).toEqual(['Dev']);
    expect(filterBranches(branches, 'e/')).toEqual(['feature/x']);
    expect(filterBranches(branches, 'release')).toEqual(['RELEASE-1']);
    expect(filterBranches(branches, 'zzz')).toEqual([]);
  });

  test('三态：loading / failed 空文案优先于列表', () => {
    const loading = render(panel({ view: null, loading: true }));
    expect(loading.container.textContent).toContain(copy.branch.loading);
    loading.unmount();
    const failed = render(panel({ view: null, failed: true }));
    expect(failed.container.textContent).toContain(copy.branch.unavailable);
    failed.unmount();
  });

  test('点击分支触发 onSelect；busy 时全部入口禁用且点击无效', () => {
    const selected: string[] = [];
    const page = render(panel({ onSelect: (branch) => selected.push(branch) }));
    React.act(() => {
      [...page.container.querySelectorAll('button')].find((b) => b.textContent === 'dev')?.click();
    });
    expect(selected).toEqual(['dev']);
    page.unmount();

    const busyPage = render(panel({ busy: true, onSelect: (branch) => selected.push(branch) }));
    const busyButtons = [...busyPage.container.querySelectorAll('button')];
    expect(busyButtons.every((b) => b.disabled)).toBe(true);
    React.act(() => {
      busyButtons.find((b) => b.textContent === 'dev')?.click();
    });
    expect(selected).toEqual(['dev']);
    busyPage.unmount();
  });

  test('底部动作行：创建与图谱入口回调', () => {
    const events: string[] = [];
    const page = render(panel({ onCreate: () => events.push('create'), onOpenGraph: () => events.push('graph') }));
    React.act(() => {
      [...page.container.querySelectorAll('button')].find((b) => b.textContent?.includes(copy.branch.createBranch))?.click();
    });
    React.act(() => {
      [...page.container.querySelectorAll('button')].find((b) => b.textContent?.includes(copy.branch.openGraph))?.click();
    });
    expect(events).toEqual(['create', 'graph']);
    page.unmount();
  });
});
