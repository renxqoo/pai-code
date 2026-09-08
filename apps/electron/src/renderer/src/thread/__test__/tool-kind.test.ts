import { describe, expect, test } from 'bun:test';

import { toolKindOf, toolPreviewMono } from '../tool-kind';

describe('toolKindOf', () => {
  test('pi 内置工具 → 对应种类', () => {
    expect(toolKindOf('bash')).toBe('bash');
    expect(toolKindOf('powershell')).toBe('bash');
    expect(toolKindOf('read')).toBe('read');
    expect(toolKindOf('write')).toBe('write');
    expect(toolKindOf('edit')).toBe('edit');
    expect(toolKindOf('grep')).toBe('search');
    expect(toolKindOf('find')).toBe('search');
    expect(toolKindOf('glob')).toBe('search');
    expect(toolKindOf('ls')).toBe('list');
    expect(toolKindOf('task')).toBe('subagent');
  });

  test('大小写与首尾空白不敏感（演示/扩展出现过 Bash 首字母大写）', () => {
    expect(toolKindOf('Bash')).toBe('bash');
    expect(toolKindOf(' READ ')).toBe('read');
    expect(toolKindOf('Glob')).toBe('search');
  });

  test('未知工具落 other，不猜测', () => {
    expect(toolKindOf('webfetch')).toBe('other');
    expect(toolKindOf('')).toBe('other');
    expect(toolKindOf(' Totally_New ')).toBe('other');
  });
});

describe('toolPreviewMono', () => {
  test('命令与文件路径类用等宽，其余用正文字体', () => {
    expect(toolPreviewMono('bash')).toBe(true);
    expect(toolPreviewMono('read')).toBe(true);
    expect(toolPreviewMono('edit')).toBe(true);
    expect(toolPreviewMono('write')).toBe(true);
    expect(toolPreviewMono('search')).toBe(true);
    expect(toolPreviewMono('list')).toBe(true);
    expect(toolPreviewMono('subagent')).toBe(false);
    expect(toolPreviewMono('other')).toBe(false);
  });
});
