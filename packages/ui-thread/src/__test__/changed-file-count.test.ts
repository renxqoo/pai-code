import { describe, expect, test } from 'bun:test';

import { changedFileCount } from '../changed-file-count';
import type { EditCallRef, ToolStatusRef } from '../tool-refs';
import type { EditHunkView, ToolCallStatus } from '@x3code/contracts';

function edit(path: string, status: ToolCallStatus = 'ok'): ToolStatusRef & EditCallRef {
  const hunk: EditHunkView = { oldText: 'a', newText: 'b', path };
  return { status, editHunks: [hunk] };
}

describe('changedFileCount 轮级变更摘要（收起时也得看得到动了哪些文件）', () => {
  test('成功改动的文件去重计数', () => {
    expect(changedFileCount([edit('a.ts'), edit('a.ts'), edit('b.ts')])).toBe(2);
  });

  test('只数成功调用：失败/运行中的编辑不算（没改成的东西不报）', () => {
    expect(changedFileCount([edit('a.ts', 'failed'), edit('b.ts', 'running')])).toBeNull();
  });

  test('无编辑调用 / 空路径片段 → null（无变更可报，不挂后缀）', () => {
    expect(changedFileCount([])).toBeNull();
    expect(changedFileCount([{ status: 'ok', editHunks: [] }])).toBeNull();
    expect(changedFileCount([edit('')])).toBeNull();
  });
});
