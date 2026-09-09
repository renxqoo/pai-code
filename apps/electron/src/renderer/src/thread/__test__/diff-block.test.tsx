import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DiffBlock } from '../diff-block';
import type { DiffSummaryModel } from '../thread-model';

const DIFF: DiffSummaryModel = {
  changedFiles: 2,
  additions: 14,
  deletions: 4,
  files: [
    { path: 'apps/electron/src/renderer/src/thread/diff-block.tsx', additions: 12, deletions: 3 },
    { path: 'packages/contracts/src/api.ts', additions: 2, deletions: 1 },
  ],
};

function render(diff: DiffSummaryModel): string {
  return renderToStaticMarkup(<DiffBlock diff={diff} onOpenDiff={() => undefined} />);
}

describe('DiffBlock 摘要卡', () => {
  test('默认收起：只渲染标题行，文件明细不进 DOM', () => {
    const html = render(DIFF);
    expect(html).toContain('2 个文件变更');
    expect(html).toContain('+14');
    expect(html).toContain('-4');
    expect(html).toContain('打开 Diff');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('diff-block.tsx');
    expect(html).not.toContain('<li');
  });

  test('标题行高度收紧：卡片常态只占 36px 一行', () => {
    const html = render(DIFF);
    expect(html).toContain('h-[36px]');
  });
});
