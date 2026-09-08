import { expect, test } from 'bun:test';

import { activeTokenQuery, applyTokenSelection, filterTokenItems } from '../token-trigger';

/** 激活判定：触发符必须在行首或空白后，token 内无空白（/ 与 @ 同语义）。 */
test.each([
  ['行首斜杠', '/', '/rev', 4, 'rev'],
  ['行首仅斜杠（空查询）', '/', '/', 1, ''],
  ['空格后斜杠', '/', 'hello /rev', 10, 'rev'],
  ['行首 @', '@', '@src', 4, 'src'],
  ['空格后 @', '@', 'see @lib/ut', 11, 'lib/ut'],
  ['中文查询', '/', '/审查会话', 5, '审查会话'],
  ['caret 在 token 中段', '/', '/review tail', 7, 'review'],
  ['@ token 内含斜杠（路径）', '@', '@src/app/ro', 12, 'src/app/ro'],
])('激活：%s', (_name, trigger, text, caret, expected) => {
  expect(activeTokenQuery(text, caret, trigger as '/' | '@')).toBe(expected);
});

test.each([
  ['词中触发符不激活', '/', '/rev tail x/y', 13],
  ['词中 @ 不激活', '@', 'a@b', 3],
  ['无触发符', '/', 'hello', 5],
  ['caret 0', '/', '/rev', 0],
  ['token 后有空格（caret 在空白后）', '/', '/rev tail', 8],
])('不激活：%s', (_name, trigger, text, caret) => {
  expect(activeTokenQuery(text, caret, trigger as '/' | '@')).toBeNull();
});

test('采纳：替换 token 并追加尾空格，保留后续文本（/ 与 @）', () => {
  expect(applyTokenSelection('/rev tail', 4, '/', '/review')).toEqual({ text: '/review  tail', caret: 8 });
  expect(applyTokenSelection('see @li', 7, '@', 'lib/utils.ts')).toEqual({ text: 'see @lib/utils.ts ', caret: 18 });
  expect(applyTokenSelection('/', 1, '/', 'skill:writer')).toEqual({ text: '/skill:writer ', caret: 14 });
  expect(applyTokenSelection('@', 1, '@', 'src/app.ts')).toEqual({ text: '@src/app.ts ', caret: 12 });
});

test('采纳：无激活 token 原样返回不盲插', () => {
  expect(applyTokenSelection('plain', 5, '/', '/x')).toEqual({ text: 'plain', caret: 5 });
});

test('过滤：空查询同引用、大小写不敏感子串、无命中空数组', () => {
  const items = [{ name: '/review' }, { name: 'skill:writer' }];
  expect(filterTokenItems(items, '')).toBe(items);
  expect(filterTokenItems(items, 'REV').map((item) => item.name)).toEqual(['/review']);
  expect(filterTokenItems(items, 'writer').map((item) => item.name)).toEqual(['skill:writer']);
  expect(filterTokenItems(items, 'zzz')).toEqual([]);
});
