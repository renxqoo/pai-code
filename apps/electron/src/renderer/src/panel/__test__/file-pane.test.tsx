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
  test('kind 分派命中；同 kind 内按原 token 细分；未知 kind 走通用读取失败', () => {
    expect(filePaneErrorText({ kind: 'io_failed', message: 'not_found' }, texts)).toBe(texts.notFound);
    expect(filePaneErrorText({ kind: 'io_failed', message: 'read_failed' }, texts)).toBe(texts.readFailed);
    expect(filePaneErrorText({ kind: 'invalid_params', message: 'binary_file' }, texts)).toBe(texts.binary);
    expect(filePaneErrorText({ kind: 'invalid_params', message: 'invalid_path' }, texts)).toBe(texts.invalidParams);
    expect(filePaneErrorText({ kind: 'path_forbidden', message: 'path_forbidden' }, texts)).toBe(texts.pathForbidden);
    expect(filePaneErrorText({ kind: 'cwd_forbidden' }, texts)).toBe(texts.cwdForbidden);
    expect(filePaneErrorText({ kind: 'cwd_not_found' }, texts)).toBe(texts.cwdNotFound);
    expect(filePaneErrorText({ kind: 'transient', face: 'busy' }, texts)).toBe(texts.readFailed);
  });
});

function render(cwd: string, path: string, read: (cwd: string, path: string) => Promise<ApiOutcome<'file/read'>>): string {
  return renderToStaticMarkup(<FilePane cwd={cwd} path={path} readProjectFile={read} />);
}

describe('FilePane 静态渲染（读取前 loading 态）', () => {
  test('路径常显 + loading 文案；Markdown 文件带预览/源码切换', () => {
    const pending = () => Promise.resolve({ ok: false as const, error: { kind: 'io_failed' as const, message: 'not_found' } });
    const html = render('/w', 'docs/readme.md', pending);
    expect(html).toContain('docs/readme.md');
    expect(html).toContain(copy.panel.file.loading);
    expect(html).toContain(copy.panel.file.preview);
    expect(html).toContain(copy.panel.file.source);
    const code = render('/w', 'src/main.ts', pending);
    expect(code).not.toContain(copy.panel.file.preview);
  });
});
