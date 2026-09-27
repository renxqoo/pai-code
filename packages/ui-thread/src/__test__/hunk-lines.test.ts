import { describe, expect, test } from 'bun:test';

import { allHunkLines, hunkLines } from '../hunk-lines';

describe('hunkLines 片段 → 展示行', () => {
  test('原文行标删除、新文行标新增，删除段在前', () => {
    expect(hunkLines({ oldText: 'a\nb', newText: 'c', path: '' }, 0)).toEqual([
      { key: '0-r0', text: 'a', tone: 'remove', startsHunk: true },
      { key: '0-r1', text: 'b', tone: 'remove', startsHunk: false },
      { key: '0-a0', text: 'c', tone: 'add', startsHunk: false },
    ]);
  });

  test('末尾换行不产出伪空行（片段常以换行结尾，不是内容）', () => {
    expect(hunkLines({ oldText: 'a\n', newText: 'b\n', path: '' }, 0).map((line) => line.text)).toEqual(['a', 'b']);
  });

  test('片段序号进 key：多片段行的 React 身份稳定', () => {
    const first = hunkLines({ oldText: 'a', newText: 'b', path: 'a.ts' }, 0)[0]?.key;
    const second = hunkLines({ oldText: 'a', newText: 'b', path: 'a.ts' }, 1)[0]?.key;
    expect(first).not.toBe(second);
  });

  test('空片段（无原文无新文）落占位行，不渲染空壳', () => {
    expect(hunkLines({ oldText: '', newText: '', path: '' }, 0)).toEqual([
      { key: '0-empty', text: '', tone: 'plain', startsHunk: true },
    ]);
  });

  test('纯换行片段（插入/删除空行）出占位行，不塞多行原文进单行渲染', () => {
    expect(hunkLines({ oldText: '\n', newText: '', path: '' }, 0)).toEqual([
      { key: '0-r0', text: ' ', tone: 'remove', startsHunk: true },
    ]);
    expect(hunkLines({ oldText: '', newText: '\n', path: '' }, 0)).toEqual([
      { key: '0-a0', text: ' ', tone: 'add', startsHunk: true },
    ]);
  });

  test('CRLF/CR 统一分行（\\r 残留会在复制出的 diff 里变成 ^M）', () => {
    expect(hunkLines({ oldText: 'a\r\nb\rc', newText: '', path: '' }, 0).map((line) => line.text)).toEqual([
      'a',
      'b',
      'c',
    ]);
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

  test('空片段列表 → 空展示行（调用方不渲染空壳）', () => {
    expect(allHunkLines([])).toEqual([]);
  });
});
