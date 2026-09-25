import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GitStatusView } from '@paiapp/contracts';

import { GitSection } from '../git-section';

/**
 * Git 分区（T44）：空态矩阵（加载中/非仓库/失败重试）、更改行（→Diff 面板）、
 * 上游行按计数出没。分支下拉与图谱弹窗的交互走真机走查。
 */

function noop(): void {}

function status(overrides: Partial<GitStatusView>): GitStatusView {
  return {
    isRepo: true,
    current: 'feat/x',
    files: [],
    fileCount: 0,
    truncated: false,
    additions: 0,
    deletions: 0,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

const props = {
  status: status({}),
  loading: false,
  failed: false,
  onRetry: noop,
  cwd: '/w',
  branches: null,
  branchesLoading: false,
  branchesFailed: false,
  branchLocked: false,
  branchRevision: 0,
  onOpenDiff: noop,
};

describe('GitSection', () => {
  test('失败态：不可用文案 + 重试按钮', () => {
    const html = renderToStaticMarkup(<GitSection {...props} failed status={null} />);
    expect(html).toContain('Git 状态不可用');
    expect(html).toContain('重试');
  });

  test('加载中（无快照）：加载文案', () => {
    const html = renderToStaticMarkup(<GitSection {...props} loading status={null} />);
    expect(html).toContain('正在读取');
  });

  test('非仓库：单行降级（无更改/分支/图谱行）', () => {
    const html = renderToStaticMarkup(<GitSection {...props} status={status({ isRepo: false, current: null })} />);
    expect(html).toContain('非 Git 仓库');
    expect(html).not.toContain('更改');
    expect(html).not.toContain('打开 Git 图谱');
  });

  test('仓库态：更改行（增删计数 + 文件数进无障碍名）+ 分支行 + 图谱入口', () => {
    const html = renderToStaticMarkup(<GitSection {...props} status={status({ additions: 739, deletions: 290, fileCount: 12 })} />);
    expect(html).toContain('更改');
    expect(html).toContain('+739');
    expect(html).toContain('-290');
    expect(html).toContain('12 个文件变更');
    expect(html).toContain('feat/x');
    expect(html).toContain('打开 Git 图谱');
  });

  test('上游行按计数出没（0/0 不渲染）', () => {
    expect(renderToStaticMarkup(<GitSection {...props} status={status({})} />)).not.toContain('↑');
    const withUpstream = renderToStaticMarkup(<GitSection {...props} status={status({ ahead: 2, behind: 1 })} />);
    expect(withUpstream).toContain('↑2 ↓1');
  });

  test('无分支（detached）：分支行显示无分支占位', () => {
    const html = renderToStaticMarkup(<GitSection {...props} status={status({ current: null })} />);
    expect(html).toContain('（当前无分支）');
  });
});
