import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { EditHunkList } from '../edit-hunk-list';
import { allHunkLines, hunkLines } from '@x3code/ui-thread';
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
      { key: '0-r0', text: 'a', tone: 'remove', startsHunk: true },
      { key: '0-r1', text: 'b', tone: 'remove', startsHunk: false },
      { key: '0-a0', text: 'c', tone: 'add', startsHunk: false },
    ]);
  });

  test('末尾换行不产出伪空行（片段常以换行结尾，不是内容）', () => {
    expect(hunkLines({ oldText: 'a\n', newText: 'b\n' }, 0).map((line) => line.text)).toEqual(['a', 'b']);
  });

  test('片段序号进 key：多片段行的 React 身份稳定', () => {
    const first = hunkLines({ oldText: 'a', newText: 'b', path: 'a.ts' }, 0)[0]?.key;
    const second = hunkLines({ oldText: 'a', newText: 'b', path: 'a.ts' }, 1)[0]?.key;
    expect(first).not.toBe(second);
  });

  test('startsHunk 只标后续片段的首行（首片段顶边就是容器边，再画线多一道横杠）', () => {
    const lines = allHunkLines([
      { oldText: 'a', newText: 'b', path: 'a.ts' },
      { oldText: 'c', newText: 'd', path: 'a.ts' },
    ]);
    // 两段两个首行，但只有第 2 段需要分隔线
    expect(lines.filter((line) => line.startsHunk).map((line) => line.key)).toEqual(['1-r0']);
    expect(lines.map((line) => line.key)).toEqual(['0-r0', '0-a0', '1-r0', '1-a0']);
  });
});

describe('EditHunkList 补丁展示（GitHub diff 形态）', () => {
  test('删除行红底、新增行绿底，各带 +/- 前缀', () => {
    const html = renderToStaticMarkup(
      <EditHunkList hunks={[{ oldText: 'const a = 1;', newText: 'const a = 2;' }]} />,
    );
    expect(html).toContain('text-diff-del');
    expect(html).toContain('text-diff-add');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('const a = 2;');
  });

  test('症状回归：一次编辑的多段补丁只占一个容器（逐段套框会读成改了几个文件）', () => {
    const html = renderToStaticMarkup(
      <EditHunkList
        hunks={[
          { oldText: 'a', newText: 'b', path: 'a.ts' },
          { oldText: 'c', newText: 'd', path: 'a.ts' },
          { oldText: 'e', newText: 'f', path: 'a.ts' },
        ]}
      />,
    );
    // 容器 = 一个带边框的面包屑 + 一个滚动区
    expect(html.split('rounded-[8px] border border-border')).toHaveLength(2);
    // 段间用分隔线，不用独立边框
    expect(html).toContain('border-t border-border/60');
    expect(html).not.toContain('rounded-[6px]');
    expect(html).toContain('a');
    expect(html).toContain('d');
    expect(html).toContain('f');
  });

  test('单段补丁不画段间分隔线（首行没有「另一段」可分）', () => {
    const html = renderToStaticMarkup(<EditHunkList hunks={[{ oldText: 'a', newText: 'b', path: 'a.ts' }]} />);
    expect(html).not.toContain('border-t border-border/60');
  });

  test('空片段列表不渲染任何内容', () => {
    expect(renderToStaticMarkup(<EditHunkList hunks={[]} />)).toBe('');
  });
});

describe('ToolCallDetail 详情区内容', () => {
  test('edit：补丁不在行详情（已迁到文件级 diff 区，见 file-diff-section 用例）', () => {
    const html = renderToStaticMarkup(
      <ToolCallDetail call={call({ editHunks: [{ oldText: 'old', newText: 'new', path: 'a.ts' }] })} />,
    );
    expect(html).not.toContain('text-diff-del');
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
