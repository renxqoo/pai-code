import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { EditHunkList } from '../edit-hunk-list';
import { hunkLines } from '../hunk-lines';
import { ToolCallDetail } from '../tool-call-detail';
import type { ToolCallModel } from '../thread-model';

function call(overrides: Partial<ToolCallModel>): ToolCallModel {
  return {
    id: 'c1',
    name: 'edit',
    argsPreview: 'src/a.ts',
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: 0,
    durationMs: 5,
    status: 'ok',
    ...overrides,
  };
}

describe('hunkLines 片段 → 展示行', () => {
  test('原文行标删除、新文行标新增，删除段在前', () => {
    expect(hunkLines({ oldText: 'a\nb', newText: 'c' }, 0)).toEqual([
      { key: '0-r0', text: 'a', tone: 'remove' },
      { key: '0-r1', text: 'b', tone: 'remove' },
      { key: '0-a0', text: 'c', tone: 'add' },
    ]);
  });

  test('末尾换行不产出伪空行（片段常以换行结尾，不是内容）', () => {
    expect(hunkLines({ oldText: 'a\n', newText: 'b\n' }, 0).map((line) => line.text)).toEqual(['a', 'b']);
  });

  test('片段序号进 key：多片段行的 React 身份稳定', () => {
    const first = hunkLines({ oldText: 'a', newText: 'b' }, 0)[0]?.key;
    const second = hunkLines({ oldText: 'a', newText: 'b' }, 1)[0]?.key;
    expect(first).not.toBe(second);
  });
});

describe('EditHunkList 补丁展示', () => {
  test('删除行红底、新增行绿底，各带 +/- 前缀', () => {
    const html = renderToStaticMarkup(
      <EditHunkList hunks={[{ oldText: 'const a = 1;', newText: 'const a = 2;' }]} />,
    );
    expect(html).toContain('text-diff-del');
    expect(html).toContain('text-diff-add');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('const a = 2;');
  });

  test('空片段列表不渲染任何内容', () => {
    expect(renderToStaticMarkup(<EditHunkList hunks={[]} />)).toBe('');
  });
});

describe('ToolCallDetail 详情区内容', () => {
  test('edit：先展示补丁片段（改了什么），不再只有输出面板', () => {
    const html = renderToStaticMarkup(
      <ToolCallDetail call={call({ editHunks: [{ oldText: 'old', newText: 'new' }] })} />,
    );
    expect(html).toContain('old');
    expect(html).toContain('new');
    expect(html).toContain('text-diff-del');
  });

  test('read：输出即详情（文件内容面板），无补丁片段', () => {
    const html = renderToStaticMarkup(
      <ToolCallDetail call={call({ name: 'read', output: '1 const a = 1;' })} />,
    );
    expect(html).toContain('1 const a = 1;');
    expect(html).not.toContain('text-diff-del');
  });

  test('两者皆空：详情区不渲染空壳（无可看的东西）', () => {
    expect(renderToStaticMarkup(<ToolCallDetail call={call({})} />)).not.toContain('rounded-[8px]');
  });
});
