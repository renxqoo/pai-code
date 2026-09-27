import { describe, expect, test } from 'bun:test';

import { editHunksField, editHunksOf } from '../edit-hunks';

const ARGS = {
  path: 'src/a.ts',
  edits: [
    { oldText: 'const a = 1;', newText: 'const a = 2;' },
    { oldText: 'old line\nkeep', newText: 'new line\nkeep' },
  ],
};

describe('editHunksOf：edit 工具参数 → 补丁片段', () => {
  test('正常形状：逐条映射为原文/新文对', () => {
    expect(editHunksOf('edit', ARGS)).toEqual([
      { oldText: 'const a = 1;', newText: 'const a = 2;' },
      { oldText: 'old line\nkeep', newText: 'new line\nkeep' },
    ]);
  });

  test('工具名大小写不敏感（协议侧小写，扩展出现过 Edit）', () => {
    expect(editHunksOf('Edit', ARGS)).toHaveLength(2);
  });

  test('非 edit 工具不产出片段（write 是整文件重写、无基线可比）', () => {
    expect(editHunksOf('write', { path: 'a', content: 'x' })).toEqual([]);
    expect(editHunksOf('read', { path: 'a' })).toEqual([]);
    expect(editHunksOf('bash', { command: 'ls' })).toEqual([]);
  });

  test('垃圾形状降级空数组，不抛不崩', () => {
    expect(editHunksOf('edit', {})).toEqual([]);
    expect(editHunksOf('edit', { edits: 'not-array' })).toEqual([]);
    expect(editHunksOf('edit', { edits: [null, 3, 'x'] })).toEqual([]);
    expect(editHunksOf('edit', { edits: [{ oldText: 'a' }, { newText: 'b' }] })).toEqual([]);
    expect(editHunksOf('edit', { edits: [{ oldText: 1, newText: 2 }] })).toEqual([]);
  });

  test('原文与新文相同的片段丢弃（没改动的配对不是 diff 面）', () => {
    expect(editHunksOf('edit', { edits: [{ oldText: 'same', newText: 'same' }] })).toEqual([]);
  });

  test('片段数有上界：超量只取前八条（参数 edits 数组无界，展示面需封顶）', () => {
    const many = { edits: Array.from({ length: 20 }, (_, i) => ({ oldText: `o${i}`, newText: `n${i}` })) };
    expect(editHunksOf('edit', many)).toHaveLength(8);
  });

  test('超长片段截断（模型违规大段重写）：不劈代理对', () => {
    const long = 'x'.repeat(5000);
    const [hunk] = editHunksOf('edit', { edits: [{ oldText: long, newText: 'n' }] });
    expect(hunk?.oldText.length).toBeLessThan(long.length);
    // 代理对边界：半个高位代理不得出现在截断结果里
    const emoji = '😀'.repeat(1200);
    const [emojiHunk] = editHunksOf('edit', { edits: [{ oldText: emoji, newText: 'n' }] });
    expect(emojiHunk?.oldText.includes('�')).toBe(false);
  });
});

describe('editHunksField：wire 字段（空则不携带）', () => {
  test('有片段时携带 editHunks 字段', () => {
    expect(editHunksField('edit', ARGS)).toEqual({ editHunks: editHunksOf('edit', ARGS) });
  });

  test('无片段时返回空对象（字段在 wire 上缺席，与 subagents 同一约定）', () => {
    expect(editHunksField('read', { path: 'a' })).toEqual({});
    expect(editHunksField('edit', { edits: [] })).toEqual({});
  });
});
