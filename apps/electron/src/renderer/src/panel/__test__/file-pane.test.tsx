import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';
import { FilePane, fileLanguageOf, filePaneErrorText, isMarkdownPath } from '../file-pane';
import type { ApiOutcome } from '@paiapp/contracts';

describe('isMarkdownPath / fileLanguageOf', () => {
  test.each([
    ['README.md', true],
    ['docs/notes.markdown', true],
    ['src/main.ts', false],
    ['noext', false],
  ])('%s → markdown=%s', (path, expected) => {
    expect(isMarkdownPath(path)).toBe(expected);
  });

  test.each([
    ['src/main.ts', 'ts'],
    ['a/b/c.PY', 'py'],
    ['Makefile', ''],
  ])('%s → 语言标注 %s', (path, expected) => {
    expect(fileLanguageOf(path)).toBe(expected);
  });
});

describe('filePaneErrorText', () => {
  const texts = copy.panel.file.errors;
  test('词表内命中；未知 reason 走通用读取失败', () => {
    expect(filePaneErrorText('not_found', texts)).toBe(texts.not_found);
    expect(filePaneErrorText('binary_file', texts)).toBe(texts.binary_file);
    expect(filePaneErrorText('cwd_not_allowed', texts)).toBe(texts.read_failed);
  });
});

function render(cwd: string, path: string, read: (cwd: string, path: string) => Promise<ApiOutcome<'file/read'>>): string {
  return renderToStaticMarkup(<FilePane cwd={cwd} path={path} readProjectFile={read} />);
}

describe('FilePane 静态渲染（读取前 loading 态）', () => {
  test('路径常显 + loading 文案；Markdown 文件带预览/源码切换', () => {
    const pending = () => Promise.resolve({ ok: false as const, reason: 'not_found' });
    const html = render('/w', 'docs/readme.md', pending);
    expect(html).toContain('docs/readme.md');
    expect(html).toContain(copy.panel.file.loading);
    expect(html).toContain(copy.panel.file.preview);
    expect(html).toContain(copy.panel.file.source);
    const code = render('/w', 'src/main.ts', pending);
    expect(code).not.toContain(copy.panel.file.preview);
  });
});
