import { describe, expect, test } from 'bun:test';

import { compactInvocationOf, interceptsCompact } from '@paiapp/api';

/** /compact 词形镜像（x-harness COMMAND_LEXER 同构）：命中提取行余部为 customInstructions；
 *  边界词形（// 前缀/大小写/前瞻/前后空白）不命中。 */

describe('compactInvocationOf · 词形命中与行余部', () => {
  test.each([
    ['/compact', ''],
    ['/compact keep goals', 'keep goals'],
    ['  /compact  keep goals  ', 'keep goals'],
    ['/compact\n第二行', '第二行'],
  ])('%j → customInstructions %j', (message, expected) => {
    expect(compactInvocationOf(message)).toEqual({ customInstructions: expected });
    expect(interceptsCompact(message)).toBe(true);
  });

  test.each([
    ['//compact'],
    ['// compact'],
    ['/COMPACT'],
    ['/Compact'],
    ['/compactx'],
    ['/compact_x'],
    ['/compact/'],
    ['/compacta keep'],
    ['/其他命令'],
    ['普通消息 /compact'],
    ['/compacted'],
  ])('不命中：%j', (message) => {
    expect(compactInvocationOf(message)).toBeUndefined();
    expect(interceptsCompact(message)).toBe(false);
  });
});
