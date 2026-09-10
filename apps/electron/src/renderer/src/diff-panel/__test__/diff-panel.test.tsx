import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DiffSummaryModel } from '@/thread/thread-model';

import { DiffPanel } from '../diff-panel';

const DIFF: DiffSummaryModel = {
  changedFiles: 2,
  additions: 14,
  deletions: 4,
  files: [
    { path: 'apps/electron/src/renderer/src/thread/diff-block.tsx', additions: 12, deletions: 3 },
    { path: 'packages/contracts/src/api.ts', additions: 2, deletions: 1 },
  ],
};

const EMPTY: DiffSummaryModel = { changedFiles: 0, additions: 0, deletions: 0, files: [] };

function render(diff: DiffSummaryModel): string {
  return renderToStaticMarkup(<DiffPanel diff={diff} />);
}

describe('DiffPanel 侧栏面板', () => {
  test('有变更时逐行列出文件，底部汇总文件数与总增删量', () => {
    const html = render(DIFF);
    expect(html).toContain('diff-block.tsx');
    expect(html).toContain('packages/contracts/src/api.ts');
    expect(html).toContain('2 个文件变更');
    expect(html).toContain('+14');
    expect(html).toContain('-4');
  });

  test('无变更时展示空态文案，不渲染文件行', () => {
    const html = render(EMPTY);
    expect(html).toContain('本会话暂无文件变更');
    expect(html).not.toContain('<li');
  });
});
