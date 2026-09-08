import { expect, test } from 'bun:test';

import { activeSlashQuery, applySlashSelection, filterSlashItems } from '../slash-trigger';

/** 激活判定：`/` 必须在行首或空白后，token 内无空白。 */
test.each([
  ['行首', '/rev', 4, 'rev'],
  ['行首仅斜杠（空查询）', '/', 1, ''],
  ['空格后', 'hello /rev', 10, 'rev'],
  ['换行后', 'a\n/rev', 6, 'rev'],
  ['中文查询', '/审查会话', 5, '审查会话'],
  ['caret 在 token 中段', '/review|tail', 7, 'review'],
])('激活：%s', (_name, text, caret, expected) => {
  expect(activeSlashQuery(text, caret)).toBe(expected);
});

test.each([
  ['词中斜杠不激活', 'a/b', 3],
  ['无斜杠', 'hello', 5],
  ['caret 0', '/rev', 0],
  ['token 后有空格（caret 在空白后）', '/rev tail', 8],
  ['第二个词无斜杠', '/cmd tail', 9],
])('不激活：%s', (_name, text, caret) => {
  expect(activeSlashQuery(text, caret)).toBeNull();
});

test('采纳：替换 token 并追加尾空格，保留后续文本', () => {
  expect(applySlashSelection('/rev tail', 4, '/review')).toEqual({ text: '/review  tail', caret: 8 });
  expect(applySlashSelection('hello /re', 9, '/deploy')).toEqual({ text: 'hello /deploy ', caret: 14 });
  expect(applySlashSelection('/', 1, 'skill:writer')).toEqual({ text: '/skill:writer ', caret: 14 });
});

test('采纳：caret 在 token 中段只替换已输入部分，尾部保留', () => {
  expect(applySlashSelection('/review', 4, '/review')).toEqual({ text: '/review iew', caret: 8 });
});

test('过滤：空查询同引用、大小写不敏感子串、无命中空数组', () => {
  const items = [{ name: '/review' }, { name: 'skill:writer' }];
  expect(filterSlashItems(items, '')).toBe(items);
  expect(filterSlashItems(items, 'REV').map((item) => item.name)).toEqual(['/review']);
  expect(filterSlashItems(items, 'writer').map((item) => item.name)).toEqual(['skill:writer']);
  expect(filterSlashItems(items, 'zzz')).toEqual([]);
});
