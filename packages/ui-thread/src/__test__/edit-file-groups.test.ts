import { describe, expect, test } from 'bun:test';

import { groupEditsByFile } from '../edit-file-groups';
import type { EditHunkView } from '@paiapp/contracts';
import type { EditCallRef } from '../tool-refs';

function call(hunks: readonly EditHunkView[]): EditCallRef {
  return { editHunks: hunks };
}

const hunk = (path: string, oldText: string, newText: string): EditHunkView => ({ oldText, newText, path });

describe('groupEditsByFile 同一文件的多次编辑合成一个 diff', () => {
  test('症状回归：同一路径的两次 edit 调用合成一组（GitHub 形态：一个文件一个 diff）', () => {
    const groups = groupEditsByFile([
      call([hunk('src/a.ts', 'const a = 1;', 'const a = 2;')]),
      call([hunk('src/a.ts', 'export default f;', 'export default g;')]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.path).toBe('src/a.ts');
    // 补丁按编辑顺序堆叠（首次出现序）
    expect(groups[0]?.hunks.map((item) => item.newText)).toEqual(['const a = 2;', 'export default g;']);
  });

  test('不同文件各成一组（一个文件一个 diff，不跨文件合并）', () => {
    const groups = groupEditsByFile([
      call([hunk('src/a.ts', 'x', 'y')]),
      call([hunk('src/b.ts', 'p', 'q')]),
      call([hunk('src/a.ts', 'm', 'n')]),
    ]);
    expect(groups.map((group) => group.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(groups[0]?.hunks).toHaveLength(2);
    expect(groups[1]?.hunks).toHaveLength(1);
  });

  test('一次调用内的多段补丁同样归入该文件组', () => {
    const groups = groupEditsByFile([call([hunk('a.ts', 'x', 'y'), hunk('a.ts', 'p', 'q')])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.hunks).toHaveLength(2);
  });

  test('缺 path 的片段不归并（无法判断是否同一文件，各自成组）', () => {
    const groups = groupEditsByFile([call([hunk('', 'x', 'y')]), call([hunk('', 'p', 'q')])]);
    expect(groups).toHaveLength(2);
  });

  test('无编辑片段 / 空调用 → 空组（调用方据此不渲染 diff 区）', () => {
    expect(groupEditsByFile([])).toEqual([]);
    expect(groupEditsByFile([call([])])).toEqual([]);
  });
});
