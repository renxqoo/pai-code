import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DiffFileList } from '../diff-file-list';
import type { DiffFileModel } from '../thread-model';

const FILES: readonly DiffFileModel[] = [
  { path: 'apps/electron/src/renderer/src/thread/diff-block.tsx', additions: 12, deletions: 3 },
  { path: 'packages/contracts/src/api.ts', additions: 0, deletions: 0 },
];

function render(files: readonly DiffFileModel[], className?: string): string {
  return renderToStaticMarkup(<DiffFileList files={files} className={className} />);
}

describe('DiffFileList 文件明细', () => {
  test('逐行渲染路径与增删量，行数等于文件数', () => {
    const html = render(FILES);
    expect(html).toContain('diff-block.tsx');
    expect(html).toContain('packages/contracts/src/api.ts');
    expect(html).toContain('+12');
    expect(html).toContain('-3');
    expect(html).toContain('+0');
    expect(html).toContain('-0');
    expect(html.split('<li').length - 1).toBe(FILES.length);
  });

  test('长路径截断展示时以 title 兜底完整路径', () => {
    const html = render(FILES);
    expect(html).toContain('title="apps/electron/src/renderer/src/thread/diff-block.tsx"');
  });

  test('容器样式由调用方注入：不传 className 时不带内边距与边框', () => {
    const html = render(FILES);
    expect(html.startsWith('<ul>')).toBe(true);
    expect(html).not.toContain('border-t');
  });
});
