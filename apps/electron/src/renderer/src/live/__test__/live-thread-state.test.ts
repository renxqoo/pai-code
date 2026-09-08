import { describe, expect, test } from 'bun:test';

import { capSeenIds, noteCallStart, omitCallStart } from '../live-thread-state';

describe('capSeenIds', () => {
  test('未超限原样返回（同引用，零拷贝）', () => {
    const seen = new Set(['a', 'b']);
    expect(capSeenIds(seen)).toBe(seen);
  });

  test('症状回归：超限按插入序淘汰最旧（长会话无界增长），保留最新段', () => {
    const ids = Array.from({ length: 5200 }, (_, i) => `id-${i}`);
    const capped = capSeenIds(new Set(ids));
    expect(capped.size).toBe(4000);
    expect(capped.has('id-0')).toBe(false);
    expect(capped.has('id-1199')).toBe(false);
    expect(capped.has('id-1200')).toBe(true);
    expect(capped.has('id-5199')).toBe(true);
  });
});

describe('callStarts 治理', () => {
  test('noteCallStart 正常写入；未超限不裁剪', () => {
    const table = noteCallStart({}, 'c1', 10);
    expect(table).toEqual({ c1: 10 });
  });

  test('noteCallStart 超限保留最新一半', () => {
    let table: Readonly<Record<string, number>> = {};
    for (let i = 0; i < 1100; i += 1) table = noteCallStart(table, `c-${i}`, i);
    const keys = Object.keys(table);
    // 首次超限（1025 条）裁到最新 512 条，其后 75 次写入不再触发 → 最终 587 条
    expect(keys.length).toBe(587);
    expect(table['c-0']).toBeUndefined();
    expect(table['c-512']).toBeUndefined();
    expect(table['c-513']).toBeDefined();
    expect(table['c-1099']).toBe(1099);
  });

  test('omitCallStart 工具结束即除名；不存在时原引用返回', () => {
    const table = { c1: 1, c2: 2 };
    expect(omitCallStart(table, 'c1')).toEqual({ c2: 2 });
    expect(omitCallStart(table, 'c1')).not.toBe(table);
    expect(omitCallStart(table, 'nope')).toBe(table);
  });
});
