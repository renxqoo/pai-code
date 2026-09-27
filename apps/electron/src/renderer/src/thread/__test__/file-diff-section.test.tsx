import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FileDiffSection } from '../file-diff-section';
import { groupEditsByFile } from '../edit-file-groups';
import { objectName } from '../file-object-name';
import type { ToolCallModel } from '../thread-model';

function call(id: string, hunks: ToolCallModel['editHunks']): ToolCallModel {
  return {
    id,
    name: 'edit',
    argsPreview: 'a.ts',
    subagents: [],
    editHunks: hunks,
    output: '',
    exitCode: 0,
    durationMs: 5,
    status: 'ok',
  };
}

const hunk = (path: string, oldText: string, newText: string) => ({ oldText, newText, path });

describe('groupEditsByFile 同一文件的多次编辑合成一个 diff', () => {
  test('症状回归：同一路径的两次 edit 调用合成一组（GitHub 形态：一个文件一个 diff）', () => {
    const groups = groupEditsByFile([
      call('c1', [hunk('src/a.ts', 'const a = 1;', 'const a = 2;')]),
      call('c2', [hunk('src/a.ts', 'export default f;', 'export default g;')]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.path).toBe('src/a.ts');
    // 补丁按编辑顺序堆叠（首次出现序）
    expect(groups[0]?.hunks.map((item) => item.newText)).toEqual(['const a = 2;', 'export default g;']);
  });

  test('不同文件各成一组（一个文件一个 diff，不跨文件合并）', () => {
    const groups = groupEditsByFile([
      call('c1', [hunk('src/a.ts', 'x', 'y')]),
      call('c2', [hunk('src/b.ts', 'p', 'q')]),
      call('c3', [hunk('src/a.ts', 'm', 'n')]),
    ]);
    expect(groups.map((group) => group.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(groups[0]?.hunks).toHaveLength(2);
    expect(groups[1]?.hunks).toHaveLength(1);
  });

  test('一次调用内的多段补丁同样归入该文件组', () => {
    const groups = groupEditsByFile([call('c1', [hunk('a.ts', 'x', 'y'), hunk('a.ts', 'p', 'q')])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.hunks).toHaveLength(2);
  });

  test('缺 path 的片段不归并（无法判断是否同一文件，各自成组）', () => {
    const groups = groupEditsByFile([
      call('c1', [hunk('', 'x', 'y')]),
      call('c2', [hunk('', 'p', 'q')]),
    ]);
    expect(groups).toHaveLength(2);
  });

  test('无编辑片段 / 空调用 → 空组（调用方据此不渲染 diff 区）', () => {
    expect(groupEditsByFile([])).toEqual([]);
    expect(groupEditsByFile([call('c1', [])])).toEqual([]);
  });
});

describe('objectName 路径 → 文件名', () => {
  test('只显文件名，不露目录层级', () => {
    expect(objectName('apps/electron/src/thread/file-diff-section.tsx')).toBe('file-diff-section.tsx');
    expect(objectName('a.ts')).toBe('a.ts');
  });
});

describe('FileDiffSection 文件级 diff 区', () => {
  test('一个文件一行标题（只显文件名），默认收起不挂补丁；箭头紧跟文件名', () => {
    const html = renderToStaticMarkup(
      <FileDiffSection
        calls={[
          call('c1', [hunk('src/a.ts', 'const a = 1;', 'const a = 2;')]),
          call('c2', [hunk('src/a.ts', 'export default f;', 'export default g;')]),
        ]}
      />,
    );
    // 两行调用合成一行文件标题
    expect(html.split('a.ts').length - 1).toBeGreaterThan(0);
    expect(html.match(/aria-expanded/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('const a = 1;');
    // 症状回归：箭头紧跟文件名（6px gap），不得被推到行尾
    expect(html).not.toContain('ml-auto');
  });

  test('无编辑调用不渲染任何内容', () => {
    expect(renderToStaticMarkup(<FileDiffSection calls={[call('c1', [])]} />)).toBe('');
    expect(renderToStaticMarkup(<FileDiffSection calls={[]} />)).toBe('');
  });

  test('多文件：每文件一行标题', () => {
    const html = renderToStaticMarkup(
      <FileDiffSection
        calls={[call('c1', [hunk('src/a.ts', 'x', 'y')]), call('c2', [hunk('src/b.ts', 'p', 'q')])]}
      />,
    );
    expect(html.match(/aria-expanded/g) ?? []).toHaveLength(2);
    expect(html).toContain('a.ts');
    expect(html).toContain('b.ts');
  });
});
